import React from 'react';
import { encodeEan13Modules, encodeCode128BModules, isValidEan13 } from '../utils/barcode';

export interface BarcodeSvgProps {
  code: string;
  format?: 'ean13' | 'code128' | 'auto';
  height?: number;
  showText?: boolean;
  className?: string;
}

export const BarcodeSvg: React.FC<BarcodeSvgProps> = ({
  code,
  format = 'auto',
  height = 46,
  showText = true,
  className = '',
}) => {
  const isEan = format === 'ean13' || (format === 'auto' && isValidEan13(code));
  const modules = isEan ? encodeEan13Modules(code) : encodeCode128BModules(code);

  if (!modules) {
    return (
      <div className={`flex flex-col items-center justify-center p-2 border border-dashed border-muted-foreground/30 rounded text-xs text-muted-foreground ${className}`}>
        <span>Etibarsız Barkod: {code}</span>
      </div>
    );
  }

  // Calculate widths
  const moduleCount = modules.length;
  const moduleWidth = 1.4;
  const svgWidth = moduleCount * moduleWidth;
  const barHeight = showText ? height - 14 : height;

  const rects: React.ReactNode[] = [];
  let currentRun = 0;
  let startX = 0;

  for (let i = 0; i < modules.length; i++) {
    if (modules[i] === '1') {
      if (currentRun === 0) startX = i * moduleWidth;
      currentRun++;
    } else {
      if (currentRun > 0) {
        rects.push(
          <rect
            key={i}
            x={startX}
            y={0}
            width={currentRun * moduleWidth}
            height={barHeight}
            fill="currentColor"
          />
        );
        currentRun = 0;
      }
    }
  }

  if (currentRun > 0) {
    rects.push(
      <rect
        key={modules.length}
        x={startX}
        y={0}
        width={currentRun * moduleWidth}
        height={barHeight}
        fill="currentColor"
      />
    );
  }

  return (
    <div className={`inline-flex flex-col items-center bg-white p-1 select-none ${className}`}>
      <svg
        width={svgWidth}
        height={barHeight}
        viewBox={`0 0 ${svgWidth} ${barHeight}`}
        className="w-full h-auto max-w-[200px]"
        preserveAspectRatio="none"
      >
        {rects}
      </svg>
      {showText && (
        <span className="font-mono text-[10px] tracking-wider text-black font-semibold mt-0.5">
          {isEan
            ? `${code.slice(0, 1)} ${code.slice(1, 7)} ${code.slice(7, 13)}`
            : code}
        </span>
      )}
    </div>
  );
};

