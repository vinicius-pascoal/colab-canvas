import ColorPicker from './ColorPicker'
import ToolBar from './ToolBar'
import StatusBar from './StatusBar'

interface CanvasControlsProps {
  color: string
  colorHistory: string[]
  isEraser: boolean
  panMode: boolean
  connected: boolean
  userCount: number
  scale: number
  onColorChange: (color: string) => void
  onSelectBrush: () => void
  onSelectEraser: () => void
  onTogglePanMode: () => void
}

export default function CanvasControls({
  color,
  colorHistory,
  isEraser,
  panMode,
  connected,
  userCount,
  scale,
  onColorChange,
  onSelectBrush,
  onSelectEraser,
  onTogglePanMode
}: CanvasControlsProps) {
  return (
    <div className="absolute bottom-4 md:bottom-8 left-1/2 transform -translate-x-1/2 z-10 max-w-[95vw]">
      <div className="flex flex-col md:flex-row items-center gap-2 md:gap-4 px-3 md:px-6 py-3 md:py-4 bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 backdrop-blur-sm bg-opacity-95">
        <ColorPicker
          color={color}
          colorHistory={colorHistory}
          isEraser={isEraser}
          onColorChange={onColorChange}
        />

        <div className="hidden md:block h-8 w-px bg-gray-300 dark:bg-gray-600" />

        <ToolBar
          isEraser={isEraser}
          panMode={panMode}
          onSelectBrush={onSelectBrush}
          onSelectEraser={onSelectEraser}
          onTogglePanMode={onTogglePanMode}
        />

        <div className="hidden md:block h-8 w-px bg-gray-300 dark:bg-gray-600" />

        <StatusBar
          connected={connected}
          userCount={userCount}
          scale={scale}
        />
      </div>
    </div>
  )
}
