/** Use the existing Ant Design Escape contract, including unsaved-form guards. */
function stackingLevel(element: HTMLElement): number {
  let level = 0
  for (let current: HTMLElement | null = element; current; current = current.parentElement) {
    level = Math.max(level, Number.parseInt(getComputedStyle(current).zIndex, 10) || 0)
  }
  return level
}

export function handleAndroidBack(): void {
  const overlays = Array.from(document.querySelectorAll<HTMLElement>(
    '.ant-select-dropdown, .ant-picker-dropdown, .ant-popover, .ant-image-preview-wrap, .ant-modal-wrap, .ant-drawer-content',
  )).filter(element => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden')
    .sort((left, right) => stackingLevel(left) - stackingLevel(right))
  const overlay = overlays.at(-1)
  if (overlay) {
    const active = document.activeElement
    // Select/DatePicker keep keyboard focus in their input, outside the popup portal.
    const inputPopup = overlay.matches('.ant-select-dropdown, .ant-picker-dropdown')
    const target = active instanceof HTMLElement && (inputPopup || overlay.contains(active)) ? active : overlay
    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true, cancelable: true }))
    return
  }
  // BrowserRouter owns idx. Do not leave the app at its root or after a cold deep link.
  const state: unknown = window.history.state
  if (state && typeof state === 'object' && 'idx' in state && typeof state.idx === 'number' && state.idx > 0) {
    window.history.back()
  }
}
