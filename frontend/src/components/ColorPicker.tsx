interface ColorPickerProps {
  color: string
  colorHistory: string[]
  isEraser: boolean
  onColorChange: (color: string) => void
}

export default function ColorPicker({ color, colorHistory, isEraser, onColorChange }: ColorPickerProps) {
  return (
    <div className="flex items-center gap-2 md:gap-3 w-full md:w-auto justify-center">
      <label className="font-medium text-xs md:text-sm">
        Cor:
      </label>
      <input
        type="color"
        value={color}
        onChange={(e) => onColorChange(e.target.value)}
        className="w-8 h-8 md:w-10 md:h-10 cursor-pointer rounded-lg border-2 border-gray-300"
      />
      {/* Histórico de cores */}
      <div className="flex gap-1">
        {colorHistory.map((histColor, index) => (
          <button
            key={index}
            onClick={() => onColorChange(histColor)}
            className={`w-7 h-7 md:w-8 md:h-8 rounded-md border-2 transition-all hover:scale-110 ${color === histColor && !isEraser
                ? 'border-blue-500 ring-2 ring-blue-300'
                : 'border-gray-300'
              }`}
            style={{ backgroundColor: histColor }}
            title={histColor}
          />
        ))}
      </div>
    </div>
  )
}
