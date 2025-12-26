interface ToolBarProps {
  isEraser: boolean
  panMode: boolean
  onSelectBrush: () => void
  onSelectEraser: () => void
  onTogglePanMode: () => void
}

export default function ToolBar({ isEraser, panMode, onSelectBrush, onSelectEraser, onTogglePanMode }: ToolBarProps) {
  return (
    <div className="flex items-center gap-2 w-full md:w-auto justify-center">
      <button
        onClick={onSelectBrush}
        className={`px-3 md:px-4 py-2 rounded-lg font-medium text-xs md:text-base transition-all ${!isEraser && !panMode
            ? 'bg-blue-500 text-white shadow-md'
            : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
          }`}
      >
        ✏️ Pincel
      </button>
      <button
        onClick={onSelectEraser}
        className={`px-3 md:px-4 py-2 rounded-lg font-medium text-xs md:text-base transition-all ${isEraser && !panMode
            ? 'bg-blue-500 text-white shadow-md'
            : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
          }`}
      >
        ⬜ Borracha
      </button>
      <button
        onClick={onTogglePanMode}
        className={`px-3 md:px-4 py-2 rounded-lg font-medium text-xs md:text-base transition-all md:hidden ${panMode
            ? 'bg-blue-500 text-white shadow-md'
            : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
          }`}
      >
        🖐️ Mover
      </button>
    </div>
  )
}
