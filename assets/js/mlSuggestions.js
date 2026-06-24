/* ============================================
   MLSUGGESTIONS.JS — ML task & model recommendations
   ============================================ */

/**
 * suggestML(stats, columns)
 * stats: array of columnStats objects
 * Returns: { taskType, targetColumn, confidence, models: [...] }
 */
export function suggestML(stats, data) {
  const numericCols     = stats.filter(s => s.type === 'numeric');
  const categoricalCols = stats.filter(s => s.type === 'categorical');
  const totalCols       = stats.length;

  // ---- Detect likely target column ----
  const targetHints = ['target', 'label', 'class', 'survived', 'churn', 'outcome',
                        'result', 'category', 'price', 'revenue', 'salary', 'y'];
  let targetCol = stats.find(s => targetHints.some(h => s.name.toLowerCase().includes(h)));

  // ---- Infer task type ----
  let taskType = 'regression';
  let taskDesc = '';
  let confidence = 75;

  if (targetCol) {
    if (targetCol.type === 'categorical') {
      const uniq = targetCol.unique;
      taskType = uniq === 2 ? 'binary_classification' : 'multiclass_classification';
      taskDesc = uniq === 2
        ? `Binary classification — predict "${targetCol.name}" (2 classes)`
        : `Multi-class classification — predict "${targetCol.name}" (${uniq} classes)`;
      confidence = 88;
    } else {
      taskType = 'regression';
      taskDesc = `Regression — predict "${targetCol.name}" (continuous)`;
      confidence = 85;
    }
  } else if (categoricalCols.length === 0 && numericCols.length >= 3) {
    taskType = 'clustering';
    taskDesc = 'Clustering — no clear target column detected; consider unsupervised grouping';
    confidence = 60;
    targetCol = null;
  } else if (numericCols.length > 0) {
    // Pick last numeric as likely target
    targetCol = numericCols[numericCols.length - 1];
    taskType  = 'regression';
    taskDesc  = `Regression — predict "${targetCol.name}" (inferred)`;
    confidence = 65;
  }

  // ---- Suggest models ----
  const models = getModels(taskType, numericCols.length, totalCols, stats);

  // ---- Data readiness score ----
  const missing = stats.reduce((s, c) => s + c.missing, 0);
  const totalCells = stats.reduce((s, c) => s + c.total, 0) || 1;
  const missingPct = missing / totalCells;
  const readiness  = Math.round(Math.max(0, 100 - missingPct * 50));

  return {
    taskType,
    taskDesc,
    targetColumn: targetCol?.name ?? 'Unknown',
    confidence,
    readiness,
    numericFeatures: numericCols.length,
    categoricalFeatures: categoricalCols.length,
    models,
  };
}

function getModels(taskType, numericCount, totalCols, stats) {
  const modelMap = {
    regression: [
      { name: 'Random Forest Regressor',   score: 88, note: 'Handles non-linearity and mixed feature types well.' },
      { name: 'XGBoost Regressor',          score: 90, note: 'Best for tabular data with many features.' },
      { name: 'Linear Regression',          score: 72, note: 'Strong baseline; interpretable coefficients.' },
      { name: 'Ridge / Lasso',              score: 76, note: 'Good when features have multicollinearity.' },
      { name: 'Gradient Boosting',          score: 86, note: 'Robust; less prone to overfitting vs vanilla GBM.' },
    ],
    binary_classification: [
      { name: 'XGBoost Classifier',         score: 92, note: 'Top performer on tabular binary problems.' },
      { name: 'Random Forest Classifier',   score: 87, note: 'Robust; low variance via bagging.' },
      { name: 'Logistic Regression',        score: 78, note: 'Fast, interpretable, good baseline.' },
      { name: 'LightGBM',                   score: 91, note: 'Faster than XGBoost on large datasets.' },
      { name: 'SVM (RBF kernel)',            score: 80, note: 'Good for smaller, high-dimensional datasets.' },
    ],
    multiclass_classification: [
      { name: 'XGBoost Classifier',         score: 89, note: 'Handles multi-class natively via softmax.' },
      { name: 'Random Forest Classifier',   score: 85, note: 'Reliable across many class counts.' },
      { name: 'LightGBM',                   score: 88, note: 'Memory-efficient; fast on large datasets.' },
      { name: 'Neural Network (MLP)',        score: 82, note: 'Can capture complex non-linear boundaries.' },
      { name: 'K-Nearest Neighbours',       score: 70, note: 'Intuitive but slow at scale.' },
    ],
    clustering: [
      { name: 'K-Means',                    score: 80, note: 'Fast; good when cluster shapes are spherical.' },
      { name: 'DBSCAN',                      score: 82, note: 'Finds arbitrarily shaped clusters; handles outliers.' },
      { name: 'Hierarchical Clustering',    score: 75, note: 'Produces a dendrogram; useful for exploration.' },
      { name: 'Gaussian Mixture Models',    score: 78, note: 'Soft cluster assignments; probabilistic.' },
    ],
  };

  const list = (modelMap[taskType] || modelMap.regression).slice(0, 3);
  // Adjust scores based on data characteristics
  return list.map(m => ({
    ...m,
    score: Math.min(99, m.score + (numericCount > 5 ? 2 : -2)),
  }));
}