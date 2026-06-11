// ============================================
// Hardware Probing
// Works in browser (Web API) + Tauri (shell commands)
// ============================================

import { isTauri, getDesktopPlatform } from '../../utils/tauri'
import type { CpuCapabilityProfile, GpuCapabilityProfile, HardwareBackend, HardwareScanResult } from './types'

function getNavigatorLike(): Navigator | undefined {
  return typeof navigator !== 'undefined' ? navigator : undefined
}

// -------------------------------------------------------
// Tiny shell executor — only active in Tauri environment
// -------------------------------------------------------
async function runShell(cmd: string, args: string[]): Promise<string> {
  if (!isTauri()) return ''
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    const result = await invoke<{ stdout: string }>('plugin:shell|execute', {
      program: cmd,
      args,
      options: {},
    }).catch(() => ({ stdout: '' }))
    return result.stdout.trim()
  } catch {
    return ''
  }
}

// -------------------------------------------------------
// CPU
// -------------------------------------------------------
async function probeCpu(): Promise<CpuCapabilityProfile> {
  const instructionSetSet = new Set<string>()
  const platform = getDesktopPlatform()
  const nav = getNavigatorLike()

  let modelName = nav?.userAgent ?? 'Unknown CPU'
  let coreCount: number | undefined
  let threadCount: number | undefined

  if (typeof nav?.hardwareConcurrency === 'number') {
    threadCount = nav.hardwareConcurrency
  }

  if (platform === 'windows' && isTauri()) {
    try {
      const name = await runShell('powershell', [
        '-NoProfile',
        '-Command',
        '(Get-CimInstance -ClassName Win32_Processor).Name',
      ])
      if (name) modelName = name

      const cores = await runShell('powershell', [
        '-NoProfile',
        '-Command',
        '(Get-CimInstance -ClassName Win32_Processor).NumberOfCores',
      ])
      if (cores) coreCount = parseInt(cores, 10)

      // Check instruction set features via WMI / CPUID proxy
      const features = await runShell('powershell', [
        '-NoProfile',
        '-Command',
        '[System.Runtime.Intrinsics.X86.Avx2]::IsSupported; [System.Runtime.Intrinsics.X86.Avx512F]::IsSupported',
      ])
      const lines = features.split('\n').map(l => l.trim().toLowerCase())
      if (lines[0] === 'true') instructionSetSet.add('AVX2')
      if (lines[1] === 'true') instructionSetSet.add('AVX512F')
      // SSE4 and below are assumed on any modern x86
      instructionSetSet.add('SSE4.2')
      instructionSetSet.add('SSE4.1')
      instructionSetSet.add('SSSE3')
      instructionSetSet.add('SSE3')
      instructionSetSet.add('SSE2')
    } catch {
      // fall through to defaults
    }
  } else if (platform === 'linux' && isTauri()) {
    const cpuinfo = await runShell('sh', ['-c', 'cat /proc/cpuinfo | head -40'])
    if (cpuinfo) {
      const nameLine = cpuinfo.match(/model name\s*:\s*(.+)/i)
      if (nameLine) modelName = nameLine[1]
      const flagLine = cpuinfo.match(/flags\s*:\s*(.+)/i)
      if (flagLine) {
        const flags = flagLine[1].toLowerCase()
        if (flags.includes('avx512f')) instructionSetSet.add('AVX512F')
        if (flags.includes('avx2')) instructionSetSet.add('AVX2')
        if (flags.includes('sse4_2')) instructionSetSet.add('SSE4.2')
        if (flags.includes('sse4_1')) instructionSetSet.add('SSE4.1')
      }
      const coreMatch = cpuinfo.match(/cpu cores\s*:\s*(\d+)/i)
      if (coreMatch) coreCount = parseInt(coreMatch[1], 10)
    }
  } else if (platform === 'macos' && isTauri()) {
    const brand = await runShell('sysctl', ['-n', 'machdep.cpu.brand_string'])
    if (brand) modelName = brand
    const cores = await runShell('sysctl', ['-n', 'hw.physicalcpu'])
    if (cores) coreCount = parseInt(cores, 10)
    const flags = await runShell('sysctl', ['-n', 'machdep.cpu.features'])
    if (flags) {
      const f = flags.toUpperCase()
      if (f.includes('AVX2')) instructionSetSet.add('AVX2')
      if (f.includes('SSE4.2')) instructionSetSet.add('SSE4.2')
    }
    // Apple Silicon always has NEON
    if (modelName.toLowerCase().includes('apple')) instructionSetSet.add('NEON')
  }

  if (instructionSetSet.size === 0) instructionSetSet.add('SSE2') // safe minimum

  if (!coreCount && threadCount) {
    coreCount = Math.max(1, Math.floor(threadCount / 2))
  }

  return {
    modelName,
    coreCount,
    threadCount,
    instructionSets: [...instructionSetSet],
  }
}

// -------------------------------------------------------
// GPU
// -------------------------------------------------------

async function getWebGLGpuName(): Promise<string | undefined> {
  if (typeof document === 'undefined') return undefined

  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl')
    if (!gl) return undefined
    const ext = gl.getExtension('WEBGL_debug_renderer_info')
    if (!ext) return undefined
    return gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) as string | undefined
  } catch {
    return undefined
  }
}

async function probeGpus(): Promise<{ gpus: GpuCapabilityProfile[]; backends: HardwareBackend[] }> {
  const gpus: GpuCapabilityProfile[] = []
  const backends = new Set<HardwareBackend>()
  const platform = getDesktopPlatform()

  // WebGL renderer name — always available, gives us the GPU brand
  const webglName = await getWebGLGpuName()

  if (platform === 'windows' && isTauri()) {
    try {
      const gpuData = await runShell('powershell', [
        '-NoProfile',
        '-Command',
        'Get-CimInstance -ClassName Win32_VideoController | Select-Object Name, AdapterRAM | Format-List',
      ])
      const nameMatches = [...gpuData.matchAll(/Name\s*:\s*(.+)/gi)]
      const vramMatches = [...gpuData.matchAll(/AdapterRAM\s*:\s*(\d+)/gi)]

      for (let i = 0; i < nameMatches.length; i++) {
        const name = nameMatches[i][1].trim()
        const vramBytes = vramMatches[i] ? parseInt(vramMatches[i][1], 10) : 0
        const vramGiB = vramBytes > 0 ? Math.round((vramBytes / 1073741824) * 10) / 10 : undefined
        const vendor = name.toLowerCase()
        let backend: HardwareBackend = 'cpu'
        if (vendor.includes('nvidia')) { backend = 'cuda'; backends.add('cuda') }
        else if (vendor.includes('amd') || vendor.includes('radeon')) { backend = 'rocm'; backends.add('rocm') }
        else if (vendor.includes('intel')) { backends.add('vulkan') }
        backends.add('vulkan')
        gpus.push({ backend, name, vramGiB })
      }
    } catch {
      // fall through
    }
  } else if (platform === 'linux' && isTauri()) {
    const lspci = await runShell('sh', ['-c', 'lspci | grep -i vga'])
    if (lspci) {
      for (const line of lspci.split('\n').filter(Boolean)) {
        const name = line.replace(/.*VGA.compatible.controller:\s*/i, '').trim()
        const vendor = name.toLowerCase()
        let backend: HardwareBackend = 'vulkan'
        if (vendor.includes('nvidia')) { backend = 'cuda'; backends.add('cuda') }
        else if (vendor.includes('amd') || vendor.includes('radeon')) { backend = 'rocm'; backends.add('rocm') }
        backends.add('vulkan')
        // nvidia-smi for VRAM
        let vramGiB: number | undefined
        if (backend === 'cuda') {
          const smi = await runShell('nvidia-smi', ['--query-gpu=memory.total', '--format=csv,noheader,nounits'])
          if (smi) {
            const mb = parseInt(smi.split('\n')[0].trim(), 10)
            if (!isNaN(mb)) vramGiB = Math.round((mb / 1024) * 10) / 10
          }
        }
        gpus.push({ backend, name, vramGiB })
      }
    }
  } else if (platform === 'macos' && isTauri()) {
    const sp = await runShell('system_profiler', ['SPDisplaysDataType'])
    const nameMatch = sp.match(/Chipset Model:\s*(.+)/i)
    const vramMatch = sp.match(/VRAM.*?:\s*(\d+)\s*(MB|GB)/i)
    if (nameMatch) {
      const name = nameMatch[1].trim()
      let vramGiB: number | undefined
      if (vramMatch) {
        const v = parseInt(vramMatch[1], 10)
        vramGiB = vramMatch[2].toUpperCase() === 'GB' ? v : Math.round((v / 1024) * 10) / 10
      }
      const isAppleSilicon = name.toLowerCase().includes('apple')
      const backend: HardwareBackend = isAppleSilicon ? 'metal' : 'metal'
      backends.add('metal')
      gpus.push({ backend, name, vramGiB })
    }
  }

  // Fallback: use WebGL renderer name if we got no GPUs from OS
  if (gpus.length === 0 && webglName) {
    const name = webglName
    const v = name.toLowerCase()
    let backend: HardwareBackend = 'vulkan'
    if (v.includes('nvidia')) { backend = 'cuda'; backends.add('cuda') }
    else if (v.includes('amd') || v.includes('radeon')) { backend = 'rocm'; backends.add('rocm') }
    else if (v.includes('apple')) { backend = 'metal'; backends.add('metal') }
    else backends.add('vulkan')
    gpus.push({ backend, name })
  }

  if (gpus.length === 0) {
    backends.add('cpu')
    gpus.push({ backend: 'cpu', name: 'CPU (no discrete GPU detected)' })
  }

  return { gpus, backends: [...backends] }
}

// -------------------------------------------------------
// RAM
// -------------------------------------------------------
async function probeRamGiB(): Promise<number> {
  const platform = getDesktopPlatform()
  if (platform === 'windows' && isTauri()) {
    const out = await runShell('powershell', [
      '-NoProfile',
      '-Command',
      '(Get-CimInstance -ClassName Win32_ComputerSystem).TotalPhysicalMemory',
    ])
    if (out) {
      const bytes = parseInt(out, 10)
      if (!isNaN(bytes)) return Math.round((bytes / 1073741824) * 10) / 10
    }
  } else if (platform === 'linux' && isTauri()) {
    const out = await runShell('sh', ['-c', "grep MemTotal /proc/meminfo | awk '{print $2}'"])
    if (out) {
      const kb = parseInt(out, 10)
      if (!isNaN(kb)) return Math.round((kb / 1048576) * 10) / 10
    }
  } else if (platform === 'macos' && isTauri()) {
    const out = await runShell('sysctl', ['-n', 'hw.memsize'])
    if (out) {
      const bytes = parseInt(out, 10)
      if (!isNaN(bytes)) return Math.round((bytes / 1073741824) * 10) / 10
    }
  }
  // navigator.deviceMemory is an approximate hint available in secure contexts
  const approx = (getNavigatorLike() as { deviceMemory?: number } | undefined)?.deviceMemory
  return approx ?? 8
}

// -------------------------------------------------------
// Public entry point
// -------------------------------------------------------
export async function scanHardware(): Promise<HardwareScanResult> {
  const notes: string[] = []
  const [cpu, { gpus, backends }, ramGiB] = await Promise.all([probeCpu(), probeGpus(), probeRamGiB()])

  if (!isTauri()) {
    notes.push('Running in browser mode — hardware detection is limited. Install the desktop app for full accuracy.')
  }

  return {
    cpu,
    ramGiB,
    gpus,
    detectedBackends: [...new Set(backends)],
    notes,
  }
}
