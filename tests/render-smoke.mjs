import assert from 'node:assert/strict';
import {createServer} from 'vite';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const server = await createServer({
  optimizeDeps: {noDiscovery: true, include: []},
  server: {middlewareMode: true},
  appType: 'custom'
});
try {
  const {default: TechnicalPage} = await server.ssrLoadModule('/src/TechnicalPage.jsx');
  const {default: CostingPage} = await server.ssrLoadModule('/src/CostingPage.jsx');
  const {default: Panel} = await server.ssrLoadModule('/src/ConfiguratorPanel.jsx');
  const {families, initialConfig} = await server.ssrLoadModule('/src/domain.js');
  const {defaultProfile} = await server.ssrLoadModule('/src/costing.js');
  let n = 0;
  for (const f of families) {
    const c = initialConfig(f.id);
    for (const [Component, props] of [
      [TechnicalPage, {config: c}],
      [CostingPage, {config: c, profile: defaultProfile(), onChange() {}}],
      ...['composition', 'dimensions', 'fabric', 'details', 'room', 'technical'].map((step) => [
        Panel,
        {config: c, step, change() {}, start() {}}
      ])
    ]) {
      const html = renderToStaticMarkup(React.createElement(Component, props));
      assert.ok(html.length > 100);
      assert.ok(!html.includes('NaN'));
      n++;
    }
  }
  console.log(
    `✓ ${n} server-render smoke scenarios: five categories, six panels, economics and technical pages`
  );
} finally {
  await server.close();
}
