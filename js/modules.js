/* Module manifest. Each module = one sidebar entry. Live modules have views in app.js;
   "soon" modules render their roadmap below. Adding a module = adding an entry here. */
window.OS_MODULES = [
  { id: 'home', label: 'Command center', icon: 'home', status: 'live' },
  {
    id: 'content', label: 'Content engine', icon: 'spark', status: 'live',
    pages: [
      { id: 'approvals', label: 'Approvals', status: 'live' },
      { id: 'calendar', label: 'Calendar', status: 'live' },
      { id: 'published', label: 'Published', status: 'live' },
      { id: 'analytics', label: 'Analytics', status: 'live' },
      { id: 'competitors', label: 'Competitors', status: 'live' },
      { id: 'research', label: 'Trends & research', status: 'soon' },
      { id: 'learning', label: 'AI learning', status: 'live' },
      { id: 'setup', label: 'Posting settings', status: 'live' }
    ]
  },
  {
    id: 'creators', label: 'Creator outreach', icon: 'people', status: 'soon', phase: 2,
    kpi: 'Creators posting about our products',
    pitch: 'Find creators in our niche and reach out to them, using a dedicated creator tool instead of building our own.',
    features: [
      ['Find creators in our niche', 'Search and shortlist wellness creators inside the creator tool.'],
      ['Reach out to them', 'Outreach messages and follow-ups sent and tracked by the tool.'],
      ['See it here', 'Shortlist and reply status shown in this dashboard.']
    ],
    note: 'Tool: Euka (from $199/month, built around TikTok Shop). To decide with Deep before this phase starts: whether he will use TikTok Shop, and the budget.',
    tools: ['Euka']
  },
  {
    id: 'store', label: 'Store & funnel', icon: 'bag', status: 'soon', phase: 2,
    kpi: 'Conversion rate and order value',
    pitch: 'Recommendations to improve the Shopify store and its funnel, plus email sign-up and newsletters through the tools the store already uses.',
    features: [
      ['Store recommendations', 'AI review of product pages and checkout using real Shopify data, with a list of suggested fixes.'],
      ['Bundle and add-on offers', 'Suggestions for packages with an extra product, for example at checkout.'],
      ['Email sign-up to newsletter', 'Sign-up form, welcome emails and marketing emails in Klaviyo, which is already installed on the store.']
    ],
    note: 'Already on the store: Shopify, Klaviyo, Appstle subscriptions (subscribe and save is pre-selected) and Judge.me reviews. We build on these instead of replacing them.',
    tools: ['Shopify', 'Klaviyo']
  },
  {
    id: 'customers', label: 'Customer success', icon: 'heart', status: 'soon', phase: 2,
    kpi: 'Repeat orders',
    pitch: 'Personal messages that help each buyer use their product well, and a reminder to reorder before they run out.',
    features: [
      ['Customer list', 'Name, email and phone from Shopify orders, with each customer\'s products and order dates.'],
      ['Getting started', 'Messages for the exact product bought: what to expect, best time to take it, dos and don\'ts.'],
      ['Reorder reminder', 'Each product is about a 30-day supply, so a reminder goes out before it runs out: consistency beats intensity.']
    ],
    note: 'Sent by Klaviyo flows triggered by Shopify orders. Texts only go to customers who agreed to SMS at checkout (US rules).',
    tools: ['Shopify', 'Klaviyo email and SMS']
  }
];
