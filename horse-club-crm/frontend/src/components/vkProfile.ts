export function vkProfileUrl(vkId?: string | null): string | undefined {
  return vkId && /^[1-9]\d{0,14}$/.test(vkId) ? `https://vk.com/id${vkId}` : undefined
}

export function vkProfilePayload(input?: string | null): { vkId: string | null } {
  return { vkId: input?.trim() || null }
}
