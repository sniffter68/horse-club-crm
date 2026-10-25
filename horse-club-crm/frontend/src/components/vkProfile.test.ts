import { describe, expect, it } from 'vitest'
import { vkProfilePayload, vkProfileUrl } from './vkProfile'

describe('direct VK profile binding', () => {
  it('builds a profile link only for a numeric identity returned by the server', () => {
    expect(vkProfileUrl('12345678')).toBe('https://vk.com/id12345678')
    for (const input of [null, undefined, '', '0', '-1', 'javascript:alert(1)', 'https://evil.com', 'username']) expect(vkProfileUrl(input)).toBeUndefined()
  })
  it('sends formats unchanged for server resolution and clears explicitly with null', () => {
    expect(vkProfilePayload(' @username ')).toEqual({ vkId: '@username' })
    expect(vkProfilePayload('https://vk.com/username')).toEqual({ vkId: 'https://vk.com/username' })
    for (const input of ['', ' ', null, undefined]) expect(vkProfilePayload(input)).toEqual({ vkId: null })
  })
})
