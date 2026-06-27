// Vercel Web Analytics initialization
// This script initializes Vercel Web Analytics for static HTML sites
// Documentation: https://vercel.com/docs/analytics/quickstart

(function() {
  // Initialize the queue for analytics events
  // This allows analytics calls to be made before the script loads
  window.va = window.va || function() {
    (window.vaq = window.vaq || []).push(arguments);
  };
  
  // Create and inject the Vercel Analytics script
  // This script will be automatically served by Vercel when deployed at /_vercel/insights/script.js
  var script = document.createElement('script');
  script.defer = true;
  script.src = '/_vercel/insights/script.js';
  
  // Add error handling for local development
  script.onerror = function() {
    console.warn('Vercel Analytics: Failed to load script. Analytics will be available when deployed to Vercel.');
  };
  
  document.head.appendChild(script);
})();
