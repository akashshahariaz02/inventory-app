function getProductStockTotals(db, productId) {
  const product = db.prepare('SELECT id, project_id FROM products WHERE id = ?').get(productId);
  if (!product) return null;

  const totalIn = db.prepare(`
    SELECT COALESCE(SUM(quantity), 0) as total
    FROM procurements
    WHERE project_id = ? AND product_id = ?
  `).get(product.project_id, product.id).total;

  const totalOut = db.prepare(`
    SELECT COALESCE(SUM(quantity), 0) as total
    FROM issues
    WHERE project_id = ? AND product_id = ?
  `).get(product.project_id, product.id).total;

  return {
    totalIn: Number(totalIn || 0),
    totalOut: Number(totalOut || 0),
    balance: Number(totalIn || 0) - Number(totalOut || 0)
  };
}

function recalculateProductStock(db, productId) {
  const totals = getProductStockTotals(db, productId);
  if (!totals) return null;

  db.prepare('UPDATE products SET current_stock = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(totals.balance, productId);

  return totals;
}

function recalculateAllProductStock(db) {
  const products = db.prepare('SELECT id FROM products').all();
  const changed = [];

  const updateAll = db.transaction(() => {
    for (const product of products) {
      const old = db.prepare('SELECT current_stock FROM products WHERE id = ?').get(product.id);
      const totals = recalculateProductStock(db, product.id);
      if (totals && Number(old.current_stock || 0) !== totals.balance) {
        changed.push({ id: product.id, old_stock: Number(old.current_stock || 0), new_stock: totals.balance });
      }
    }
  });

  updateAll();
  return changed;
}

module.exports = { getProductStockTotals, recalculateProductStock, recalculateAllProductStock };
