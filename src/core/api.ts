import { useAuthStore } from '../store/authStore.ts';

export async function apiFetch(url: string, options: RequestInit = {}) {
  const { accessToken, logout } = useAuthStore.getState();

  const isFormData = options.body instanceof FormData;

  const headers: Record<string, string> = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    ...(options.headers as Record<string, string>),
  };

  try {
    const fetchOptions: RequestInit = {
      credentials: 'include', // Includes httpOnly cookies for /refresh
      ...options,
      headers
    };
    const response = await fetch(url, fetchOptions);
    
    // Prevent multiple parallel logouts
    const isLoggingOut = (window as any)._isLoggingOut;

    if ((response.status === 401 || response.status === 403) && !isLoggingOut) {
      // Token expired or unauthorized
      (window as any)._isLoggingOut = true;
      console.warn('Session expired or unauthorized. Logging out...');
      logout();
      window.dispatchEvent(new CustomEvent('navigate', { detail: '/login' }));
      
      // Clear flag after a delay to allow UI to settle
      setTimeout(() => { (window as any)._isLoggingOut = false; }, 2000);
      
      throw new Error('Session expired');
    } else if (response.status === 401 || response.status === 403) {
      throw new Error('Session expired (logout in progress)');
    }

    const contentType = response.headers.get('content-type');
    if (!response.ok) {
      if (contentType && contentType.includes('application/json')) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'API request failed');
      } else {
        const errorText = await response.text();
        throw new Error(`API request failed with status ${response.status}: ${errorText.substring(0, 100)}`);
      }
    }

    if (contentType && contentType.includes('application/json')) {
      return await response.json();
    }
    
    return response;
  } catch (error) {
    console.error(`API Fetch Error (${url}):`, error);
    throw error;
  }
}
