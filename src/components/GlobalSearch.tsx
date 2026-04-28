import React, { useState, useEffect, useRef } from 'react';
import { Search, X, Loader2, Ticket, User, Calendar, ChevronRight } from 'lucide-react';
import { useAuthStore } from '../store/authStore.ts';
import { useSettingsStore } from '../store/settingsStore.ts';

interface SearchResult {
  id: number;
  ticketNumber: string;
  subject: string;
  status: string;
  createdAt: string;
  creatorName: string;
}

export const GlobalSearch: React.FC = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const { accessToken } = useAuthStore();
  const { language } = useSettingsStore();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (query.length >= 2) {
        performSearch();
      } else {
        setResults([]);
      }
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [query]);

  const performSearch = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/tickets/search?q=${encodeURIComponent(query)}&limit=5`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        setResults(data.tickets);
        setIsOpen(true);
      }
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (ticketId: number) => {
    window.dispatchEvent(new CustomEvent('navigate', { detail: `/tickets/${ticketId}` }));
    setIsOpen(false);
    setQuery('');
  };

  return (
    <div className="relative w-full max-w-md" ref={containerRef}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
        <input
          type="text"
          placeholder={language === 'ar' ? 'بحث عن تذكرة...' : 'Search tickets...'}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (e.target.value.length >= 2) setIsOpen(true);
          }}
          onFocus={() => {
            if (query.length >= 2) setIsOpen(true);
          }}
          className="w-full pl-10 pr-10 py-2 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm outline-none focus:ring-2 focus:ring-primary-blue transition-all"
        />
        {query && (
          <button 
            onClick={() => { setQuery(''); setResults([]); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {isOpen && (query.length >= 2) && (
        <div className="absolute top-12 left-0 w-full bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl z-50 overflow-hidden">
          {loading ? (
            <div className="p-4 flex items-center justify-center text-slate-400 gap-2">
              <Loader2 className="animate-spin" size={18} />
              <span className="text-sm">{language === 'ar' ? 'جاري البحث...' : 'Searching...'}</span>
            </div>
          ) : results.length > 0 ? (
            <div className="max-h-96 overflow-y-auto">
              {results.map((ticket) => (
                <div 
                  key={ticket.id}
                  onClick={() => handleSelect(ticket.id)}
                  className="p-4 border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-all group"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className="mt-1 p-1.5 bg-blue-50 dark:bg-blue-900/30 rounded-lg text-primary-blue">
                        <Ticket size={16} />
                      </div>
                      <div>
                        <p className="text-xs font-mono font-bold text-primary-blue">{ticket.ticketNumber}</p>
                        <p className="text-sm font-bold text-slate-900 dark:text-white line-clamp-1 group-hover:text-primary-blue transition-all">
                          {ticket.subject}
                        </p>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-[10px] flex items-center gap-1 text-slate-500 dark:text-slate-300">
                            <User size={10} />
                            {ticket.creatorName}
                          </span>
                          <span className="text-[10px] flex items-center gap-1 text-slate-500 dark:text-slate-300">
                            <Calendar size={10} />
                            {new Date(ticket.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </div>
                    <ChevronRight size={16} className="text-slate-300 group-hover:text-primary-blue mt-1" />
                  </div>
                </div>
              ))}
              <div 
                className="p-3 bg-slate-50 dark:bg-slate-800/50 text-center"
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('navigate', { detail: `/inbox?search=${encodeURIComponent(query)}` }));
                  setIsOpen(false);
                }}
              >
                <button className="text-xs font-bold text-primary-blue uppercase tracking-widest hover:underline">
                  {language === 'ar' ? 'عرض كل النتائج' : 'View all results'}
                </button>
              </div>
            </div>
          ) : (
            <div className="p-8 text-center text-slate-400 text-sm">
              {language === 'ar' ? 'لا توجد نتائج' : 'No results found'}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
