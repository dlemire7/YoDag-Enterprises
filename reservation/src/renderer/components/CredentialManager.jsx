import React, { useState, useEffect, useCallback } from 'react'
import { useIpc } from '../hooks/useIpc'

const PLATFORMS = [
  {
    id: 'Resy',
    color: '#e84141',
    icon: 'R',
    description: '40 restaurants'
  },
  {
    id: 'Tock',
    color: '#9333ea',
    icon: 'T',
    description: '15 restaurants'
  },
  {
    id: 'OpenTable',
    color: '#da3743',
    icon: 'OT',
    description: '5 restaurants'
  }
]

export default function CredentialManager() {
  const { invoke } = useIpc()
  const [statuses, setStatuses] = useState({})
  const [signingIn, setSigningIn] = useState({})
  const [signInResults, setSignInResults] = useState({})
  const [loading, setLoading] = useState(true)

  const fetchStatuses = useCallback(async () => {
    const result = await invoke('credentials:get-all-statuses')
    if (result) setStatuses(result)
    setLoading(false)
  }, [invoke])

  useEffect(() => { fetchStatuses() }, [fetchStatuses])

  const handleBrowserLogin = async (platformId, method) => {
    setSigningIn(prev => ({ ...prev, [platformId]: method }))
    setSignInResults(prev => ({ ...prev, [platformId]: null }))
    try {
      const result = await invoke('credentials:browser-login', platformId, method)
      setSignInResults(prev => ({ ...prev, [platformId]: result }))
      if (result?.success) await fetchStatuses()
    } catch (err) {
      setSignInResults(prev => ({
        ...prev,
        [platformId]: { success: false, error: err.message }
      }))
    } finally {
      setSigningIn(prev => ({ ...prev, [platformId]: null }))
    }
  }

  const handleDelete = async (platformId) => {
    const result = await invoke('credentials:delete', platformId)
    if (result) setStatuses(result)
    setSignInResults(prev => ({ ...prev, [platformId]: null }))
  }

  if (loading) return <div className="credential-manager__loading">Loading credentials...</div>

  return (
    <div className="credential-manager">
      {PLATFORMS.map(platform => {
        const status = statuses[platform.id] || {}
        const activeMethod = signingIn[platform.id]
        const signInResult = signInResults[platform.id]

        return (
          <div key={platform.id} className="credential-card" style={{ '--platform-color': platform.color }}>
            <div className="credential-card__header">
              <div className="credential-card__icon" style={{ backgroundColor: platform.color }}>
                {platform.icon}
              </div>
              <div className="credential-card__info">
                <h3 className="credential-card__name">{platform.id}</h3>
                <span className="credential-card__desc">{platform.description}</span>
              </div>
              <div className="credential-card__status">
                {status.validated_at ? (
                  <span className="credential-status credential-status--validated">Signed In</span>
                ) : (
                  <span className="credential-status credential-status--none">Not Connected</span>
                )}
              </div>
            </div>

            {activeMethod && (
              <div className="credential-card__signing-in">
                <div className="credential-signing-spinner" />
                <span>Complete sign-in in the browser window...</span>
              </div>
            )}

            {signInResult && (
              <div className={`credential-test-result ${signInResult.success ? 'credential-test-result--success' : 'credential-test-result--error'}`}>
                {signInResult.success
                  ? 'Session saved successfully'
                  : `Sign-in failed: ${signInResult.error}`}
              </div>
            )}

            {!activeMethod && (
              <div className="credential-card__methods">
                <button
                  className="credential-method-btn credential-method-btn--google"
                  onClick={() => handleBrowserLogin(platform.id, 'google')}
                  disabled={!!activeMethod}
                >
                  <svg className="credential-method-btn__icon" viewBox="0 0 24 24" width="18" height="18">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  Sign in with Google
                </button>
                <button
                  className="credential-method-btn credential-method-btn--phone"
                  onClick={() => handleBrowserLogin(platform.id, 'phone')}
                  disabled={!!activeMethod}
                >
                  <span className="credential-method-btn__phone-icon">&#9742;</span>
                  Sign in with Phone
                </button>
              </div>
            )}

            {status.validated_at && !activeMethod && (
              <div className="credential-card__footer-row">
                <span className="credential-card__validated-at">
                  Session saved: {new Date(status.validated_at + 'Z').toLocaleString()}
                </span>
                <button
                  className="credential-card__delete-btn"
                  onClick={() => handleDelete(platform.id)}
                >
                  Sign Out
                </button>
              </div>
            )}
          </div>
        )
      })}

      <div className="credential-manager__note">
        <p>A browser window will open for you to sign in directly with each platform. Your session is encrypted with Windows DPAPI and stored locally.</p>
      </div>
    </div>
  )
}
