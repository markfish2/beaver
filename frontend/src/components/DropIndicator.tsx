interface DropIndicatorProps {
  targetNodeId: string;
  position: 'before' | 'after' | 'child';
}

const DropIndicator = ({ targetNodeId, position }: DropIndicatorProps) => {
  const targetEl = document.querySelector(`[data-node-id="${targetNodeId}"]`);
  if (!targetEl) return null;

  const rect = targetEl.getBoundingClientRect();

  if (position === 'child') {
    return (
      <div
        className="fixed z-[200] pointer-events-none rounded"
        style={{
          left: rect.left + 4,
          top: rect.top + 2,
          width: rect.width - 8,
          height: rect.height - 4,
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          border: '2px solid rgba(59, 130, 246, 0.4)',
          borderRadius: '4px',
        }}
      />
    );
  }

  const top = position === 'before' ? rect.top - 2 : rect.bottom - 2;

  return (
    <div
      className="fixed z-[200] pointer-events-none"
      style={{
        left: rect.left,
        top,
        width: rect.width,
        height: 4,
        backgroundColor: 'rgb(59, 130, 246)',
        borderRadius: '2px',
        boxShadow: '0 0 6px rgba(59, 130, 246, 0.5)',
      }}
    />
  );
};

export default DropIndicator;
