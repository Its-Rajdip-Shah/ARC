export default function PriorityPanel({ isOpen }) {
  return (
    <aside
      id="priority-panel"
      aria-hidden={!isOpen}
      className={`
        fixed bottom-0 right-0 top-[110px] z-20
        bg-arc-bg
        transition-[left,opacity,visibility] duration-300 ease-out
        ${
          isOpen
            ? 'visible left-arc-sidebar opacity-100'
            : 'invisible left-full opacity-0'
        }
      `}
    >
      <div className="mx-auto w-full max-w-[760px] px-12 pt-5">
        <h1 className="arc-display text-center text-[52px] leading-none">
          Priority
        </h1>
      </div>
    </aside>
  )
}
