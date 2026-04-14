import { ImageResponse } from 'next/og';

export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          background: '#2563eb',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
          padding: '5px 6px 5px',
          gap: '3px',
          borderRadius: '7px',
        }}
      >
        <div style={{ width: '4px', height: '8px', background: 'rgba(255,255,255,0.55)', borderRadius: '2px' }} />
        <div style={{ width: '4px', height: '14px', background: 'rgba(255,255,255,0.8)', borderRadius: '2px' }} />
        <div style={{ width: '4px', height: '10px', background: 'rgba(255,255,255,0.65)', borderRadius: '2px' }} />
        <div style={{ width: '4px', height: '18px', background: 'white', borderRadius: '2px' }} />
      </div>
    ),
    { width: 32, height: 32 }
  );
}
