export default function CriteriaSlider({ label, description, enabled, value, min, max, step, unit, onToggle, onChange }) {
  return (
    <div className="space-y-2">
      <div className="flex items-start gap-3">
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
      {enabled && (
        <div className="flex items-center gap-3 pl-12">
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(e) => onChange(parseFloat(e.target.value))}
            className="flex-1 h-1.5 bg-gray-200 rounded-full appearance-none cursor-pointer accent-blue-600"
          />
          <span className="text-xs font-medium text-gray-600 w-14 text-right tabular-nums">
            {value} {unit}
          </span>
        </div>
      )}
    </div>
  )
}
