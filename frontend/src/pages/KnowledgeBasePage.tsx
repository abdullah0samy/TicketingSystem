import React, { useState, useEffect, useMemo, useCallback } from 'react';
import ErrorBanner from '../components/ErrorBanner.tsx';
import { useAuthStore } from '../store/authStore.ts';
import { useSettingsStore } from '../store/settingsStore.ts';
import { translations } from '../core/translations.ts';
import { apiFetch } from '../core/api.ts';
import { 
  Search, 
  BookOpen, 
  ChevronRight, 
  Eye, 
  Clock, 
  User, 
  Tag,
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  ThumbsUp,
  Share2,
  MessageSquare,
  Plus,
  Edit2,
  Trash2,
  MoreVertical,
  X,
  PlusCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface Article {
  id: number;
  titleAr: string;
  titleEn: string;
  contentAr: string;
  contentEn: string;
  categoryId: number;
  authorId: number;
  views: number;
  createdAt: string;
  category: { nameAr: string; nameEn: string };
  author: { fullNameAr: string; fullNameEn: string };
}

interface Category {
  id: number;
  nameAr: string;
  nameEn: string;
  _count: { articles: number };
}

export default function KnowledgeBasePage() {
  const { accessToken, user } = useAuthStore();
  const { language } = useSettingsStore();
  const t = translations[language];

  const hasKbPermission = useMemo(() => {
    if (!user) return false;
    if (user.role === 'super_admin') return true;
    
    if (user.permissionsOverride?.canManageKnowledgeBase !== null && user.permissionsOverride?.canManageKnowledgeBase !== undefined) {
      return user.permissionsOverride.canManageKnowledgeBase;
    }
    
    return user.department?.defaultPermissions?.canManageKnowledgeBase || false;
  }, [user]);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [categorySearchTerm, setCategorySearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [showArticleForm, setShowArticleForm] = useState(false);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [editingArticle, setEditingArticle] = useState<Article | null>(null);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);

  const [articleForm, setArticleForm] = useState({
    titleAr: '', titleEn: '', contentAr: '', contentEn: '', categoryId: ''
  });

  const [categoryForm, setCategoryForm] = useState({
    nameAr: '', nameEn: ''
  });

  const filteredCategories = useMemo(() => {
    if (!categorySearchTerm.trim()) return categories;
    const term = categorySearchTerm.toLowerCase();
    return categories.filter(cat => 
      cat.nameAr.toLowerCase().includes(term) || 
      cat.nameEn.toLowerCase().includes(term)
    );
  }, [categories, categorySearchTerm]);

  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();
    const fetch = async () => {
      try {
        await fetchCategories(controller.signal);
      } catch (error: any) {
        if (isMounted) { setError(error?.message || 'Something went wrong'); console.error('Error fetching categories:', error); }
      }
    };
    fetch();
    return () => {
      controller.abort();
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      if (isMounted) {
        fetchArticles(controller.signal);
      }
    }, 400);
    return () => {
      clearTimeout(timer);
      controller.abort();
      isMounted = false;
    };
  }, [searchTerm, selectedCategory, page]);

  const fetchCategories = async (signal?: AbortSignal) => {
    try {
      const data = await apiFetch('/api/knowledge/categories', { signal });
      setCategories(data);
    } catch (error: any) {
      if (error.name === 'AbortError') return;
      setError(error?.message || 'Something went wrong');
      console.error('Error fetching categories:', error);
    }
  };

  const fetchArticles = async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const query = new URLSearchParams({
        page: page.toString(),
        limit: '12',
        search: searchTerm,
        ...(selectedCategory ? { categoryId: selectedCategory.toString() } : {})
      }).toString();
      
      const data = await apiFetch(`/api/knowledge/articles?${query}`, { signal });
      setArticles(data.data);
      setTotalPages(data.pagination.pages);
    } catch (error: any) {
      if (error.name === 'AbortError') return;
      setError(error?.message || 'Something went wrong');
      console.error('Error fetching articles:', error);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  };

  const handleViewArticle = async (article: Article) => {
    setSelectedArticle(article);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    try {
      await apiFetch(`/api/knowledge/articles/${article.id}/view`, {
        method: 'POST'
      });
    } catch (error) {
      setError(error?.message || 'Something went wrong');
      console.error('Error incrementing views:', error);
    }
  };

  const handleCreateArticle = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/knowledge/articles', {
        method: 'POST',
        body: JSON.stringify(articleForm)
      });
      setShowArticleForm(false);
      setArticleForm({ titleAr: '', titleEn: '', contentAr: '', contentEn: '', categoryId: '' });
      fetchArticles();
      fetchCategories(); 
    } catch (error) {
      setError(error?.message || 'Something went wrong');
      console.error('Error creating article:', error);
    }
  };

  const handleUpdateArticle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingArticle) return;
    try {
      await apiFetch(`/api/knowledge/articles/${editingArticle.id}`, {
        method: 'PUT',
        body: JSON.stringify(articleForm)
      });
      setEditingArticle(null);
      setShowArticleForm(false);
      fetchArticles();
    } catch (error) {
      setError(error?.message || 'Something went wrong');
      console.error('Error updating article:', error);
    }
  };

  const handleDeleteArticle = async (id: number) => {
    if (!window.confirm(language === 'ar' ? 'هل أنت متأكد من حذف هذه المقالة؟' : 'Are you sure you want to delete this article?')) return;
    try {
      await apiFetch(`/api/knowledge/articles/${id}`, {
        method: 'DELETE'
      });
      fetchArticles();
      fetchCategories();
    } catch (error) {
      setError(error?.message || 'Something went wrong');
      console.error('Error deleting article:', error);
    }
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const url = editingCategory ? `/api/knowledge/categories/${editingCategory.id}` : '/api/knowledge/categories';
      const method = editingCategory ? 'PUT' : 'POST';
      await apiFetch(url, {
        method,
        body: JSON.stringify(categoryForm)
      });
      setShowCategoryForm(false);
      setEditingCategory(null);
      setCategoryForm({ nameAr: '', nameEn: '' });
      fetchCategories();
    } catch (error) {
      setError(error?.message || 'Something went wrong');
      console.error('Error saving category:', error);
    }
  };

  const handleDeleteCategory = async (id: number) => {
    if (!window.confirm(language === 'ar' ? 'حذف هذه الفئة؟ يعمل هذا فقط إذا لم تحتوي على مقالات.' : 'Delete this category? This only works if it has no articles.')) return;
    try {
      await apiFetch(`/api/knowledge/categories/${id}`, {
        method: 'DELETE'
      });
      fetchCategories();
    } catch (error) {
      setError(error?.message || 'Something went wrong');
      console.error('Error deleting category:', error);
      alert('Failed to delete. Ensure category is empty.');
    }
  };

  const highlightText = (text: string, term: string) => {
    if (!term.trim()) return text;
    try {
      const regex = new RegExp(`(${term})`, 'gi');
      const parts = text.split(regex);
      return (
        <>
          {parts.map((part, i) => 
            regex.test(part) ? (
              <mark key={i} className="bg-yellow-200 dark:bg-yellow-900/50 text-[var(--text-main)] rounded-sm px-0.5">
                {part}
              </mark>
            ) : (
              part
            )
          )}
        </>
      );
    } catch (e) {
      return text;
    }
  };

  const getSnippet = (content: string, term: string, length: number = 150) => {
    if (!term.trim()) return content.substring(0, length) + (content.length > length ? '...' : '');
    
    const index = content.toLowerCase().indexOf(term.toLowerCase());
    if (index === -1) return content.substring(0, length) + (content.length > length ? '...' : '');

    const start = Math.max(0, index - Math.floor(length / 2));
    const end = Math.min(content.length, start + length);
    
    let snippet = content.substring(start, end);
    if (start > 0) snippet = '...' + snippet;
    if (end < content.length) snippet = snippet + '...';
    
    return snippet;
  };

  if (loading) return <div className="p-8 text-center text-[var(--text-muted)]">{t.loadingKnowledgeBase}</div>;

  return (
    <>
    <ErrorBanner error={error} onRetry={() => { setError(null); fetchCategories(); fetchArticles(); }} onDismiss={() => setError(null)} />
    <div className="max-w-7xl mx-auto pb-20">
      <AnimatePresence mode="wait">
        {selectedArticle ? (
          <motion.div 
            key="article"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-8"
          >
            <button 
              onClick={() => setSelectedArticle(null)}
              className="flex items-center gap-2 text-[var(--text-secondary)] hover:text-primary-blue transition-all font-bold"
            >
              <ArrowLeft size={20} />
              {t.backToKnowledgeBase}
            </button>

            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
              <span className="hover:text-primary-blue cursor-pointer transition-colors" onClick={() => setSelectedArticle(null)}>{t.knowledgeBase}</span>
              <ChevronRight size={12} className={language === 'ar' ? 'rotate-180' : ''} />
              <span className="text-primary-blue">{language === 'ar' ? selectedArticle.category.nameAr : selectedArticle.category.nameEn}</span>
              <ChevronRight size={12} className={language === 'ar' ? 'rotate-180' : ''} />
              <span className="text-[var(--text-muted)] truncate max-w-[200px]">{language === 'ar' ? selectedArticle.titleAr : selectedArticle.titleEn}</span>
            </div>

            <div className="premium-card overflow-hidden">
              <div className="p-8 md:p-12 space-y-6">
                <div className="flex flex-wrap items-center gap-4 text-xs font-bold uppercase tracking-widest text-[var(--text-muted)]">
                  <span className="px-3 py-1 rounded-full bg-primary-blue/10 text-primary-blue">
                    {language === 'ar' ? selectedArticle.category.nameAr : selectedArticle.category.nameEn}
                  </span>
                  <div className="flex items-center gap-1">
                    <Clock size={14} />
                    {new Date(selectedArticle.createdAt).toLocaleDateString()}
                  </div>
                  <div className="flex items-center gap-1">
                    <Eye size={14} />
                    {selectedArticle.views} {t.views}
                  </div>
                </div>

                <h1 className="text-3xl md:text-4xl font-bold text-[var(--text-main)]">
                  {language === 'ar' ? selectedArticle.titleAr : selectedArticle.titleEn}
                </h1>

                <div className="flex items-center gap-3 py-4 border-y border-[var(--border-dim)]">
                  <div className="w-10 h-10 rounded-full bg-[var(--bg-elevated)] flex items-center justify-center text-[var(--text-muted)]">
                    <User size={20} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-[var(--text-main)]">
                      {language === 'ar' ? selectedArticle.author.fullNameAr : selectedArticle.author.fullNameEn}
                    </p>
                    <p className="text-xs text-[var(--text-secondary)]">{t.author}</p>
                  </div>
                </div>

                <div className="prose prose-invert max-w-none text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap">
                  {language === 'ar' ? selectedArticle.contentAr : selectedArticle.contentEn}
                </div>

                <div className="flex items-center justify-between pt-8 border-t border-[var(--border-dim)]">
                  <div className="flex items-center gap-4">
                    <button className="flex items-center gap-2 px-4 py-2 premium-card shadow-sm text-[var(--text-secondary)] hover:text-primary-blue transition-all">
                      <ThumbsUp size={18} />
                      <span className="text-sm font-bold">{t.helpful}</span>
                    </button>
                    <button className="flex items-center gap-2 px-4 py-2 premium-card shadow-sm text-[var(--text-secondary)] hover:text-primary-blue transition-all">
                      <Share2 size={18} />
                    </button>
                  </div>
                  <button className="flex items-center gap-2 text-primary-blue font-bold hover:underline">
                    <MessageSquare size={18} />
                    {t.askQuestion}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div 
            key="list"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-12"
          >
            <div className="text-center space-y-6 pt-12 pb-6">
              <h1 className="text-4xl md:text-5xl font-bold text-[var(--text-main)]">
                {t.kbHelpTitle}
              </h1>
              <div className="max-w-2xl mx-auto relative group">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)] group-focus-within:text-primary-blue transition-colors" size={24} />
                  <input 
                  type="text"
                  placeholder={t.kbSearchPlaceholder}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="input-surface w-full pl-14 pr-6 py-5 text-lg shadow-xl shadow-slate-200/20 dark:shadow-none bg-[var(--bg-surface)] border-[var(--border-main)] text-[var(--text-main)]"
                />
              </div>

              {hasKbPermission && (
                <div className="flex items-center justify-center gap-4 mt-8">
                  <button 
                    onClick={() => {
                      setEditingArticle(null);
                      setArticleForm({ titleAr: '', titleEn: '', contentAr: '', contentEn: '', categoryId: '' });
                      setShowArticleForm(true);
                    }}
                    className="flex items-center gap-2 px-6 py-3 bg-primary-blue text-white rounded-2xl font-bold shadow-lg shadow-primary-blue/20 hover:scale-105 transition-all text-sm"
                  >
                    <Plus size={20} />
                    {t.writeNewArticle}
                  </button>
                  <button 
                    onClick={() => setShowCategoryForm(true)}
                    className="flex items-center gap-2 px-6 py-3 premium-card shadow-sm text-[var(--text-main)] font-bold transition-all text-sm"
                  >
                    <PlusCircle size={20} />
                    {t.manageCategories}
                  </button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
              <div className="space-y-6">
                <h3 className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest px-4">
                  {t.categories}
                </h3>
                <div className="px-4">
                  <input
                    type="text"
                    placeholder={t.categorySearch}
                    value={categorySearchTerm}
                    onChange={(e) => setCategorySearchTerm(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-[var(--border-main)] bg-[var(--bg-surface)] text-sm text-[var(--text-main)] outline-none focus:ring-2 focus:ring-primary-blue transition-all"
                  />
                </div>
                <div className="space-y-1">
                  <button 
                    onClick={() => { setSelectedCategory(null); setPage(1); }}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl transition-all ${!selectedCategory ? 'bg-primary-blue text-white shadow-lg shadow-primary-blue/20' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]'}`}
                  >
                    <span className="font-bold">{t.allArticles}</span>
                  </button>
                  {filteredCategories.map(cat => (
                    <button 
                      key={cat.id}
                      onClick={() => { setSelectedCategory(cat.id); setPage(1); }}
                      className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl transition-all ${selectedCategory === cat.id ? 'bg-primary-blue text-white shadow-lg shadow-primary-blue/20' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]'}`}
                    >
                      <span className="font-bold">{language === 'ar' ? cat.nameAr : cat.nameEn}</span>
                      <span className={`text-xs font-bold ${selectedCategory === cat.id ? 'text-white/70' : 'text-[var(--text-muted)]'}`}>{cat._count.articles}</span>
                    </button>
                  ))}
                </div>

                <div className="p-6 bg-primary-blue/5 rounded-3xl border border-primary-blue/10 space-y-4">
                  <h4 className="font-bold text-primary-blue">{t.needMoreHelp}</h4>
                  <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                    {t.supportText}
                  </p>
                  <button className="w-full py-2 rounded-xl bg-primary-blue text-white text-xs font-bold hover:bg-blue-800 transition-all">
                    {t.createTicket}
                  </button>
                </div>
              </div>

              <div className="lg:col-span-3 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {articles.map((article) => (
                    <motion.div 
                      key={article.id}
                      layout
                      className="group premium-card p-6 shadow-sm hover:shadow-xl hover:border-primary-blue/30 transition-all cursor-pointer relative"
                    >
                      <div onClick={() => handleViewArticle(article)}>
                        <div className="flex items-center justify-between mb-4">
                          <span className="px-2 py-1 rounded-lg bg-[var(--bg-elevated)]/50 text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest">
                            {language === 'ar' ? article.category.nameAr : article.category.nameEn}
                          </span>
                          <div className="flex items-center gap-1 text-[var(--text-muted)] text-[10px] font-bold">
                            <Eye size={12} />
                            {article.views}
                          </div>
                        </div>
                        <h3 className="text-lg font-bold text-[var(--text-main)] group-hover:text-primary-blue transition-colors mb-3">
                          {highlightText(language === 'ar' ? article.titleAr : article.titleEn, searchTerm)}
                        </h3>
                        <p className="text-sm text-[var(--text-secondary)] mb-6 min-h-[3rem]">
                          {searchTerm 
                            ? highlightText(getSnippet(language === 'ar' ? article.contentAr : article.contentEn, searchTerm), searchTerm)
                            : (language === 'ar' ? article.contentAr : article.contentEn).substring(0, 100) + '...'}
                        </p>
                      </div>

                      {hasKbPermission && (
                        <div className="absolute top-4 right-4 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingArticle(article);
                              setArticleForm({
                                titleAr: article.titleAr,
                                titleEn: article.titleEn,
                                contentAr: article.contentAr,
                                contentEn: article.contentEn,
                                categoryId: article.categoryId.toString()
                              });
                              setShowArticleForm(true);
                            }}
                            className="p-1.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-dim)] text-[var(--text-muted)] hover:text-primary-blue transition-all"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteArticle(article.id);
                            }}
                            className="p-1.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-dim)] text-[var(--text-muted)] hover:text-danger-red transition-all"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-4 border-t border-[var(--border-dim)]" onClick={() => handleViewArticle(article)}>
                        <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                          <User size={14} />
                          {language === 'ar' ? article.author.fullNameAr : article.author.fullNameEn}
                        </div>
                        <ChevronRight size={18} className="text-[var(--text-muted)] group-hover:text-primary-blue group-hover:translate-x-1 transition-all" />
                      </div>
                    </motion.div>
                  ))}
                </div>
                
                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-4 pt-8">
                    <button 
                      disabled={page === 1}
                      onClick={() => { setPage(p => p - 1); window.scrollTo({ top: 300, behavior: 'smooth' }); }}
                      className="p-3 rounded-2xl border border-[var(--border-main)] text-[var(--text-secondary)] hover:text-primary-blue disabled:opacity-30 transition-all bg-[var(--bg-surface)]"
                    >
                      <ChevronLeft size={24} />
                    </button>
                    <div className="flex items-center gap-1">
                      {Array.from({ length: totalPages }).map((_, i) => (
                        <button 
                          key={i}
                          onClick={() => { setPage(i + 1); window.scrollTo({ top: 300, behavior: 'smooth' }); }}
                          className={`w-10 h-10 rounded-xl font-bold text-sm transition-all ${page === i + 1 ? 'bg-primary-blue text-white shadow-lg shadow-primary-blue/20' : 'text-[var(--text-muted)] hover:bg-[var(--bg-elevated)]'}`}
                        >
                          {i + 1}
                        </button>
                      ))}
                    </div>
                    <button 
                      disabled={page === totalPages}
                      onClick={() => { setPage(p => p + 1); window.scrollTo({ top: 300, behavior: 'smooth' }); }}
                      className="p-3 rounded-2xl border border-[var(--border-main)] text-[var(--text-secondary)] hover:text-primary-blue disabled:opacity-30 transition-all bg-[var(--bg-surface)]"
                    >
                      {language === 'ar' ? <ChevronRight size={24} className="rotate-180" /> : <ChevronRight size={24} />}
                    </button>
                  </div>
                )}

                {articles.length === 0 && (
                  <div className="text-center py-20 bg-[var(--bg-main)] rounded-3xl border-2 border-dashed border-[var(--border-main)]">
                    <BookOpen size={48} className="mx-auto text-[var(--text-muted)] mb-4" />
                    <p className="text-[var(--text-secondary)] font-bold">{t.noArticlesFound}</p>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {showArticleForm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="premium-card w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
          >
            <div className="px-8 py-6 border-b border-[var(--border-dim)] flex items-center justify-between bg-[var(--border-dim)]">
              <div>
                <h3 className="text-xl font-bold text-[var(--text-main)]">
                  {editingArticle ? t.editArticle : t.newArticle}
                </h3>
                <p className="text-xs text-[var(--text-muted)] mt-1">{t.fillBothDetails}</p>
              </div>
              <button 
                onClick={() => { setShowArticleForm(false); setEditingArticle(null); }}
                className="p-2 hover:bg-[var(--bg-elevated)] rounded-xl transition-all"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={editingArticle ? handleUpdateArticle : handleCreateArticle} className="p-8 overflow-y-auto space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[10px] font-bold bg-green-500/10 text-green-500 px-2 py-0.5 rounded uppercase tracking-widest">AR</span>
                    <h4 className="font-bold text-[var(--text-secondary)] text-sm">العربية</h4>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-[var(--text-secondary)]">العنوان</label>
                    <input 
                      type="text"
                      dir="rtl"
                      required
                      value={articleForm.titleAr}
                      onChange={(e) => setArticleForm({...articleForm, titleAr: e.target.value})}
                      className="w-full px-4 py-3 rounded-xl border border-[var(--border-main)] bg-[var(--bg-main)] outline-none focus:ring-2 focus:ring-primary-blue transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-[var(--text-secondary)]">المحتوى</label>
                    <textarea 
                      dir="rtl"
                      required
                      rows={12}
                      value={articleForm.contentAr}
                      onChange={(e) => setArticleForm({...articleForm, contentAr: e.target.value})}
                      className="w-full px-4 py-3 rounded-xl border border-[var(--border-main)] bg-[var(--bg-main)] outline-none focus:ring-2 focus:ring-primary-blue transition-all resize-none"
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[10px] font-bold bg-blue-500/10 text-blue-500 px-2 py-0.5 rounded uppercase tracking-widest">EN</span>
                    <h4 className="font-bold text-[var(--text-secondary)] text-sm">English</h4>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-[var(--text-secondary)]">Article Title</label>
                    <input 
                      type="text"
                      required
                      value={articleForm.titleEn}
                      onChange={(e) => setArticleForm({...articleForm, titleEn: e.target.value})}
                      className="w-full px-4 py-3 rounded-xl border border-[var(--border-main)] bg-[var(--bg-main)] outline-none focus:ring-2 focus:ring-primary-blue transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-[var(--text-secondary)]">Content</label>
                    <textarea 
                      required
                      rows={12}
                      value={articleForm.contentEn}
                      onChange={(e) => setArticleForm({...articleForm, contentEn: e.target.value})}
                      className="w-full px-4 py-3 rounded-xl border border-[var(--border-main)] bg-[var(--bg-main)] outline-none focus:ring-2 focus:ring-primary-blue transition-all resize-none"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-6 border-t border-[var(--border-dim)]">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="w-full md:w-64 space-y-2">
                    <label className="text-xs font-bold text-[var(--text-secondary)]">Category / التصنيف</label>
                    <select 
                      required
                      value={articleForm.categoryId}
                      onChange={(e) => setArticleForm({...articleForm, categoryId: e.target.value})}
                      className="w-full px-4 py-2.5 rounded-xl border border-[var(--border-main)] bg-[var(--bg-main)] outline-none focus:ring-2 focus:ring-primary-blue transition-all"
                    >
                      <option value="">Select Category</option>
                      {categories.map(cat => (
                        <option key={cat.id} value={cat.id}>{language === 'ar' ? cat.nameAr : cat.nameEn}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-3">
                    <button 
                      type="button"
                      onClick={() => { setShowArticleForm(false); setEditingArticle(null); }}
                      className="px-8 py-3 rounded-2xl font-bold text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-all"
                    >
                      {t.cancel}
                    </button>
                    <button 
                      type="submit"
                      className="px-12 py-3 bg-primary-blue text-white rounded-2xl font-bold shadow-xl shadow-primary-blue/20 hover:scale-105 transition-all"
                    >
                      {editingArticle ? t.updateArticle : t.publishArticle}
                    </button>
                  </div>
                </div>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {showCategoryForm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-[var(--bg-surface)] w-full max-w-md rounded-3xl shadow-2xl overflow-hidden"
          >
            <div className="px-6 py-4 border-b border-[var(--border-dim)] flex items-center justify-between">
              <h3 className="font-bold text-[var(--text-main)]">{t.manageCategories}</h3>
              <button 
                onClick={() => { setShowCategoryForm(false); setEditingCategory(null); }}
                className="p-1 hover:bg-[var(--bg-elevated)] rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <form onSubmit={handleSaveCategory} className="space-y-4 p-4 bg-[var(--border-dim)]/50 rounded-2xl border border-[var(--border-dim)]">
                <input 
                  type="text" 
                  placeholder="Arabic Name / الاسم بالعربي"
                  dir="rtl"
                  required
                  value={categoryForm.nameAr}
                  onChange={(e) => setCategoryForm({...categoryForm, nameAr: e.target.value})}
                  className="w-full px-4 py-2 rounded-xl border border-[var(--border-main)] bg-[var(--bg-surface)] outline-none focus:ring-2 focus:ring-primary-blue"
                />
                <input 
                  type="text" 
                  placeholder="English Name"
                  required
                  value={categoryForm.nameEn}
                  onChange={(e) => setCategoryForm({...categoryForm, nameEn: e.target.value})}
                  className="w-full px-4 py-2 rounded-xl border border-[var(--border-main)] bg-[var(--bg-surface)] outline-none focus:ring-2 focus:ring-primary-blue"
                />
                <button type="submit" className="w-full py-2 bg-primary-blue text-white rounded-xl font-bold">
                  {editingCategory ? t.updateCategory : t.addCategory}
                </button>
              </form>

              <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
                {categories.map(cat => (
                  <div key={cat.id} className="flex items-center justify-between p-3 rounded-xl border border-[var(--border-dim)] hover:bg-[var(--border-dim)] transition-all">
                    <div>
                      <p className="text-sm font-bold text-[var(--text-main)]">{cat.nameEn}</p>
                      <p className="text-[10px] text-[var(--text-muted)]">{cat.nameAr}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button 
                        onClick={() => {
                          setEditingCategory(cat);
                          setCategoryForm({ nameAr: cat.nameAr, nameEn: cat.nameEn });
                        }}
                        className="p-1.5 text-[var(--text-muted)] hover:text-primary-blue"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button 
                        onClick={() => handleDeleteCategory(cat.id)}
                        className="p-1.5 text-[var(--text-muted)] hover:text-danger-red"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
    </>
  );
}
