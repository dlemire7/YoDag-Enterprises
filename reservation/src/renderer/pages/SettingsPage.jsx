import React from 'react'
import CredentialManager from '../components/CredentialManager'

export default function SettingsPage() {
  return (
    <div className="page">
      <div className="page-header">
        <h2 className="page-title">Settings</h2>
        <p className="page-subtitle">Platform credentials and preferences</p>
      </div>
      <CredentialManager />
    </div>
  )
}
