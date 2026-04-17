'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';

const Dashboard        = dynamic(() => import('@/components/Dashboard'),        { ssr: false });
const NewsFeed         = dynamic(() => import('@/components/NewsFeed'),         { ssr: false });
const AllocationView   = dynamic(() => import('@/components/AllocationView'),   { ssr: false });
const EarningsCalendar = dynamic(() => import('@/components/EarningsCalendar'), { ssr: false });
const StockScreener    = dynamic(() => import('@/components/StockScreener'),    { ssr: false });

function InstallHint() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isStandalone = window.navigator.standalone === true;
    const dismissed = localStorage.getItem('install-hint-dismissed');
    if (isIOS && !isStandalone && !dismissed) setShow(true);
  }, []);

  if (!show) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 bg-gray-900 text-white rounded-2xl p-4 shadow-2xl z-50 flex items-start gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold mb-0.5">Installer som app</p>
        <p className="text-xs text-gray-300 leading-relaxed">
          Tryk på{' '}
          <span className="font-medium inline-flex items-center gap-0.5">
            Del
            <svg className="w-3.5 h-3.5 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
          </span>{' '}
          og vælg <span className="font-medium">"Føj til hjemmeskærm"</span>
        </p>
      </div>
      <button
        onClick={() => {
          setShow(false);
          localStorage.setItem('install-hint-dismissed', '1');
        }}
        aria-label="Luk"
        className="text-gray-400 hover:text-white transition-colors mt-0.5 flex-shrink-0"
      >
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </button>
    </div>
  );
}

export default function Home() {
  const [activeTab, setActiveTab] = useState('dashboard');
  // Timestamp (ms) of when the user last viewed the news tab.
  // 0 = never visited → all articles are "new".
  const [lastNewsCheck, setLastNewsCheck] = useState(null);
  // Holds the check time FROM THE PREVIOUS visit — used to mark articles as new.
  // lastNewsCheck is updated to "now" on tab click (clears the badge), but prevNewsCheck
  // keeps the old value so articles published after the previous visit show as new.
  const [prevNewsCheck, setPrevNewsCheck] = useState(0);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
      // Navigate to news tab when notification is clicked
      navigator.serviceWorker.addEventListener('message', (e) => {
        if (e.data?.type === 'OPEN_NEWS') handleTabClick('nyheder');
      });
    }
    // Also handle ?tab=nyheder from SW openWindow
    if (new URLSearchParams(window.location.search).get('tab') === 'nyheder') {
      setActiveTab('nyheder');
    }
    const stored = localStorage.getItem('last-news-check');
    const val = stored ? parseInt(stored, 10) : 0;
    setLastNewsCheck(val);
    setPrevNewsCheck(val);
  }, []);

  const handleTabClick = (id) => {
    setActiveTab(id);
    if (id === 'nyheder') {
      // Capture old value so articles after last visit show as new this visit
      setPrevNewsCheck(lastNewsCheck ?? 0);
      const now = Date.now();
      setLastNewsCheck(now);
      localStorage.setItem('last-news-check', String(now));
    }
  };

  // Show a blue dot on the Nyheder tab when the user hasn't checked in > 30 min.
  const showNewsBadge =
    lastNewsCheck !== null && Date.now() - lastNewsCheck > 30 * 60 * 1000;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sticky header with tabs */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="pt-4 pb-0 flex items-center justify-between">
            <h1 className="text-xl font-bold text-gray-900 tracking-tight">Aktiepanel</h1>
          </div>
          <nav className="flex gap-1 mt-1 -mb-px" role="tablist">
            {/* Portefølje tab */}
            <button
              role="tab"
              aria-selected={activeTab === 'dashboard'}
              onClick={() => handleTabClick('dashboard')}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'dashboard'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Portefølje
            </button>

            {/* Allokering tab */}
            <button
              role="tab"
              aria-selected={activeTab === 'allokering'}
              onClick={() => handleTabClick('allokering')}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'allokering'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Allokering
            </button>

            {/* Nyheder tab with optional blue dot */}
            <button
              role="tab"
              aria-selected={activeTab === 'nyheder'}
              onClick={() => handleTabClick('nyheder')}
              className={`relative px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'nyheder'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Nyheder
              {showNewsBadge && activeTab !== 'nyheder' && (
                <span className="absolute top-2 right-1 w-2 h-2 rounded-full bg-blue-500" />
              )}
            </button>

            {/* Kalender tab */}
            <button
              role="tab"
              aria-selected={activeTab === 'kalender'}
              onClick={() => handleTabClick('kalender')}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'kalender'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Kalender
            </button>

            {/* Screener tab */}
            <button
              role="tab"
              aria-selected={activeTab === 'screener'}
              onClick={() => handleTabClick('screener')}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'screener'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Screener
            </button>
          </nav>
        </div>
      </header>

      {activeTab === 'dashboard'  && <Dashboard />}
      {activeTab === 'allokering' && <AllocationView />}
      {activeTab === 'nyheder'    && <NewsFeed lastNewsCheck={prevNewsCheck} />}
      {activeTab === 'kalender'   && <EarningsCalendar />}
      {activeTab === 'screener'   && <StockScreener />}

      <InstallHint />
    </div>
  );
}
