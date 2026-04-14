import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          background: 'linear-gradient(145deg, #1d4ed8 0%, #3b82f6 100%)',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '14px',
        }}
      >
        {/* Bar chart */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            gap: '9px',
            height: '72px',
          }}
        >
          <div style={{ width: '18px', height: '28px', background: 'rgba(255,255,255,0.5)', borderRadius: '4px' }} />
          <div style={{ width: '18px', height: '56px', background: 'rgba(255,255,255,0.75)', borderRadius: '4px' }} />
          <div style={{ width: '18px', height: '40px', background: 'rgba(255,255,255,0.6)', borderRadius: '4px' }} />
          <div style={{ width: '18px', height: '72px', background: 'white', borderRadius: '4px' }} />
        </div>
        {/* Label */}
        <div
          style={{
            color: 'white',
            fontSize: '28px',
            fontWeight: '700',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            letterSpacing: '-0.5px',
          }}
        >
          Aktier
        </div>
      </div>
    ),
    { width: 180, height: 180 }
  );
}
