let googleIdentityPromise: Promise<void> | null = null;

export function loadGoogleIdentity(): Promise<void> {
  if (typeof window !== 'undefined' && window.google?.accounts) {
    return Promise.resolve();
  }
  if (googleIdentityPromise) {
    return googleIdentityPromise;
  }
  googleIdentityPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      googleIdentityPromise = null;
      reject(new Error('GOOGLE_GSI_LOAD_FAILED'));
    };
    document.head.appendChild(script);
  });
  return googleIdentityPromise;
}
