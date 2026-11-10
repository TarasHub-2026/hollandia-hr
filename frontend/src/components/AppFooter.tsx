import React from 'react';

/** Small print shown at the bottom of every page. `dark` is for the green full-screen pages (sign-in). */
export default function AppFooter({ dark }: { dark?: boolean }) {
  return (
    <p className={`text-center text-[11px] leading-tight px-4 py-3 ${dark ? 'text-brand-200/80' : 'text-gray-400'}`}>
      Developer and Administrator Tara Urduja Apologista 2026
    </p>
  );
}
