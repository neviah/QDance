import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const startScanMock = vi.fn()

vi.mock('../modules/cookbook', () => ({
  useCookbook: () => ({
    scanStatus: 'idle',
    scanError: undefined,
    scan: undefined,
    recommendation: undefined,
    downloads: [],
    registeredModels: [],
  }),
  useCookbookActions: () => ({
    startScan: startScanMock,
    startDownload: vi.fn(),
  }),
}))

vi.mock('../modules/cookbook/recommend', () => ({
  resolveDownloadUrl: vi.fn(),
}))

import { HardwareScanPanel } from './HardwareScanPanel'

describe('HardwareScanPanel', () => {
  it('triggers hardware scan from the action button', () => {
    render(<HardwareScanPanel />)

    fireEvent.click(screen.getByRole('button', { name: /run hardware scan/i }))

    expect(startScanMock).toHaveBeenCalledTimes(1)
  })
})
