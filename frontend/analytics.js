// Vercel Web Analytics initialization
// This script initializes Vercel Web Analytics for static HTML sites
// Documentation: https://vercel.com/docs/analytics/quickstart

(function() {
  // Initialize the queue for analytics events
  window.va = window.va || function() {
    (window.vaq = window.vaq || []).push(arguments);
  };
  
  // Set development mode - Vercel will automatically use production mode in production
  window.vam = 'auto';
  
  // Create and inject the Vercel Analytics script
  // This script will be automatically served by Vercel when deployed
  var script = document.createElement('script');
  script.defer = true;
  script.src = '/_vercel/insights/script.js';
  
  // Add error handling
  script.onerror = function() {
    console.warn('Vercel Analytics: Failed to load script. Analytics may not be enabled for this project.');
  };
  
  document.head.appendChild(script);
})();
