interface StatusBarProps {
  connected: boolean
  userCount: number
  scale: number
}

export default function StatusBar({ connected, userCount, scale }: StatusBarProps) {
  return (
    <div className="flex items-center gap-3 md:gap-4 w-full md:w-auto justify-center">
      <div className="flex items-center gap-2">
        <div
          className={`w-2 h-2 md:w-2.5 md:h-2.5 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'
            }`}
        />
        <span className="text-xs font-medium">
          {connected ? 'Online' : 'Offline'}
        </span>
      </div>
      <span className="text-xs font-medium">
        👥 {userCount}
      </span>
      <span className="text-xs font-medium hidden md:inline">
        🔍 {scale.toFixed(1)}x
      </span>
    </div>
  )
}
