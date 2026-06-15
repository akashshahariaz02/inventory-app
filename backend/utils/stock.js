async function getProductStockTotals(db, productId) {
  const product = await db.get('SELECT id, project_id FROM products WHERE id = ?', productId);
  if (!product) return null;

  const totalInRow = await db.get(`
    SELECT COALESCE(SUM(quantity), 0) as total
    FROM procurements
    WHERE project_id = ? AND product_id = ?
  `, product.project_id, product.id);

  const totalOutRow = await db.get(`
    SELECT COALESCE(SUM(quantity), 0) as total
    FROM issues
    WHERE project_id = ? AND product_id = ?
  `, product.project_id, product.id);

  const totalIn = Number(totalInRow?.total || 0);
  const totalOut = Number(totalOutRow?.total || 0);

  return {
    totalIn,
    totalOut,
    balance: totalIn - totalOut
  };
}

async function recalculateProductStock(db, productId) {
  const totals = await getProductStockTotals(db, productId);
  if (!totals) return null;

  await db.run('UPDATE products SET current_stock = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', totals.balance, productId);
  return totals;
}

async function getAvailableStockForUpdate(db, productId) {
  const product = await db.get('SELECT id, project_id, name, unit FROM products WHERE id = ? FOR UPDATE', productId);
  if (!product) return null;

  const totals = await getProductStockTotals(db, productId);
  return {
    ...product,
    available: Number(totals?.balance || 0),
    totalIn: Number(totals?.totalIn || 0),
    totalOut: Number(totals?.totalOut || 0)
  };
}

async function recalculateAllProductStock(db) {
  const products = await db.all('SELECT id FROM products');
  const changed = [];

  await db.transaction(async tx => {
    for (const product of products) {
      const old = await tx.get('SELECT current_stock FROM products WHERE id = ?', product.id);
      const totals = await getProductStockTotals(tx, product.id);
      if (!totals) continue;

      await tx.run('UPDATE products SET current_stock = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', totals.balance, product.id);
      if (Number(old.current_stock || 0) !== totals.balance) {
        changed.push({ id: product.id, old_stock: Number(old.current_stock || 0), new_stock: totals.balance });
      }
    }
  });

  return changed;
}

module.exports = { getProductStockTotals, getAvailableStockForUpdate, recalculateProductStock, recalculateAllProductStock };
