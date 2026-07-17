export default function CriteriaToggle({ label, description, enabled, onToggle }) {
  return (
    <div className="flex items-start gap-3 py-1">
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        onClick={onToggle}
        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 mt-0.5 ${
          enabled ? 'bg-blue-600' : 'bg-gray-200'
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transform ring-0 transition duration-200 ease-in-out ${
            enabled ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </button>
      <div className="flex-1 min-w-0">
        <label className="text-sm font-medium text-gray-900 cursor-pointer select-none" onClick={onToggle}>
          {label}
        </label>
        {description && (
          <p className="text-xs text-gray-400 mt-0.5">{description}</p>
        )}
      </div>
    </div>
  )
}
