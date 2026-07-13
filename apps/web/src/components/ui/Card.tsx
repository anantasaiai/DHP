import React from 'react';

interface CardProps {
  title?: string;
  description?: string;
  action?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}

export function Card({
  title,
  description,
  action,
  children,
  className = '',
}: CardProps): React.ReactElement {
  return (
    <div className={`bg-white rounded-xl shadow-sm p-6 ${className}`}>
      {(title || action) && (
        <div className="flex items-start justify-between mb-4">
          <div>
            {title && <h3 className="text-lg font-semibold text-slate-800">{title}</h3>}
            {description && (
              <p className="text-sm text-slate-500 mt-1">{description}</p>
            )}
          </div>
          {action && <div className="ml-4 flex-shrink-0">{action}</div>}
        </div>
      )}
      {children}
    </div>
  );
}
