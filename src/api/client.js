export async function api(path, options = {}) {
  let response
  try {
    response = await fetch(`/api${path}`, {
      ...options,
      headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
    })
  } catch {
    throw new Error('Cannot reach the business API. Start "npm run server" from the autoflow folder in a second terminal.')
  }
  const body = await response.text()
  let result
  try {
    result = body ? JSON.parse(body) : null
  } catch {
    if (!response.ok) {
      throw new Error(`The API returned an invalid response (HTTP ${response.status}). Check the API server terminal for errors.`)
    }
    throw new Error('The API returned an empty or invalid response. Check the server terminal for errors.')
  }
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith('/auth/')) {
      window.dispatchEvent(new Event('owner-session-expired'))
    }
    throw new Error(result?.error || `The request failed (HTTP ${response.status}).`)
  }
  if (result === null) throw new Error('The business API returned an empty response.')
  return result
}
