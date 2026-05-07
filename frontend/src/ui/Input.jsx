import { forwardRef, useState } from 'react'

/**
 * @param {string}  label        - Label above the field
 * @param {string}  icon         - Material Symbol name for leading icon
 * @param {string}  trailing     - Material Symbol name for trailing icon (static)
 * @param {string}  hint         - Small text below the field (right-aligned link slot)
 * @param {string}  error        - Error message; styles the field red
 */
export const Input = forwardRef(function Input(
  { label, icon, trailing, hint, hintAction, error, type = 'text', className = '', ...props },
  ref
) {
  const [showPassword, setShowPassword] = useState(false)
  const isPassword = type === 'password'
  const inputType = isPassword ? (showPassword ? 'text' : 'password') : type

  return (
    <div className="flex flex-col gap-1">
      {(label || hint) && (
        <div className="flex justify-between items-center px-1">
          {label && (
            <label className="font-display font-bold uppercase tracking-widest text-[11px] text-on-surface-variant">
              {label}
            </label>
          )}
          {hint && (
            <span
              onClick={hintAction}
              className={`font-display font-bold uppercase tracking-widest text-[11px] text-primary cursor-pointer hover:text-primary-container transition-colors ${hintAction ? 'cursor-pointer' : ''}`}
            >
              {hint}
            </span>
          )}
        </div>
      )}

      <div className={`relative input-glow rounded-lg overflow-hidden group ${error ? 'ring-1 ring-error' : ''}`}>
        {icon && (
          <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline group-focus-within:text-primary transition-colors pointer-events-none">
            {icon}
          </span>
        )}

        <input
          ref={ref}
          type={inputType}
          className={`
            w-full bg-surface-container-highest/30
            border ${error ? 'border-error' : 'border-outline-variant'}
            focus:border-primary focus:outline-none focus:ring-0
            text-on-surface font-sans text-sm
            ${icon ? 'pl-12' : 'pl-4'}
            ${isPassword || trailing ? 'pr-12' : 'pr-4'}
            py-3 rounded-lg transition-all
            placeholder:text-outline/50
            ${className}
          `}
          {...props}
        />

        {isPassword && (
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setShowPassword((v) => !v)}
            className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface transition-colors"
          >
            {showPassword ? 'visibility_off' : 'visibility'}
          </button>
        )}

        {trailing && !isPassword && (
          <span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 text-outline pointer-events-none">
            {trailing}
          </span>
        )}
      </div>

      {error && (
        <p className="text-error text-xs px-1 font-sans">{error}</p>
      )}
    </div>
  )
})
