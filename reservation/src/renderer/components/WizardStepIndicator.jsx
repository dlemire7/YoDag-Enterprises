import React from 'react'

export default function WizardStepIndicator({ steps, currentStep }) {
  return (
    <div className="wizard-steps">
      {steps.map((label, index) => {
        const stepNum = index + 1
        const isActive = stepNum === currentStep
        const isCompleted = stepNum < currentStep

        let className = 'wizard-step'
        if (isActive) className += ' wizard-step--active'
        if (isCompleted) className += ' wizard-step--completed'

        return (
          <React.Fragment key={stepNum}>
            {index > 0 && <div className={`wizard-step__connector${isCompleted || isActive ? ' wizard-step__connector--filled' : ''}`} />}
            <div className={className}>
              <div className="wizard-step__dot">
                {isCompleted ? '✓' : stepNum}
              </div>
              <span className="wizard-step__label">{label}</span>
            </div>
          </React.Fragment>
        )
      })}
    </div>
  )
}
