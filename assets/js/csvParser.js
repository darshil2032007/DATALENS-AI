/* ============================================
   CSVPARSER.JS — CSV / Excel / JSON parsing
   ============================================ */

/**
 * parseFile(file) → Promise<{ data: Array<Object>, columns: string[], filename: string }>
 */
export async function parseFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();

  if (ext === 'csv') {
    return parseCsv(file);
  } else if (ext === 'xlsx' || ext === 'xls') {
    return parseExcel(file);
  } else if (ext === 'json') {
    return parseJson(file);
  } else {
    throw new Error(`Unsupported file type: .${ext}`);
  }
}

/* ---- CSV ---- */
function parseCsv(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
      complete: (results) => {
        if (results.errors.length && results.data.length === 0) {
          reject(new Error('Failed to parse CSV: ' + results.errors[0].message));
          return;
        }
        resolve({
          data: results.data,
          columns: results.meta.fields || [],
          filename: file.name,
        });
      },
      error: (err) => reject(new Error(err.message)),
    });
  });
}

/* ---- Excel ---- */
function parseExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json(sheet, { defval: null });
        const columns = raw.length > 0 ? Object.keys(raw[0]) : [];
        resolve({ data: raw, columns, filename: file.name });
      } catch (err) {
        reject(new Error('Failed to parse Excel: ' + err.message));
      }
    };
    reader.onerror = () => reject(new Error('FileReader error'));
    reader.readAsArrayBuffer(file);
  });
}

/* ---- JSON ---- */
function parseJson(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        let parsed = JSON.parse(e.target.result);
        // Unwrap common envelopes: { data: [...] } or { results: [...] }
        if (!Array.isArray(parsed)) {
          const keys = Object.keys(parsed);
          const arrKey = keys.find(k => Array.isArray(parsed[k]));
          if (arrKey) parsed = parsed[arrKey];
          else throw new Error('JSON must be an array or an object with an array field.');
        }
        const columns = parsed.length > 0 ? Object.keys(parsed[0]) : [];
        resolve({ data: parsed, columns, filename: file.name });
      } catch (err) {
        reject(new Error('Failed to parse JSON: ' + err.message));
      }
    };
    reader.onerror = () => reject(new Error('FileReader error'));
    reader.readAsText(file);
  });
}

/* ---- Sample datasets (generated inline) ---- */
export function loadSample(name) {
  if (name === 'sales') return buildSalesDataset();
  if (name === 'iris')  return buildIrisDataset();
  if (name === 'titanic') return buildTitanicDataset();
  throw new Error(`Unknown sample: ${name}`);
}

function buildSalesDataset() {
  const regions = ['North', 'South', 'East', 'West'];
  const products = ['Laptop', 'Phone', 'Tablet', 'Monitor', 'Headphones'];
  const data = Array.from({ length: 200 }, (_, i) => ({
    id: i + 1,
    date: new Date(2024, Math.floor(Math.random() * 12), Math.floor(Math.random() * 28) + 1).toISOString().slice(0, 10),
    region: regions[Math.floor(Math.random() * regions.length)],
    product: products[Math.floor(Math.random() * products.length)],
    units: Math.floor(Math.random() * 50) + 1,
    revenue: +(Math.random() * 5000 + 200).toFixed(2),
    profit: +(Math.random() * 1500 - 200).toFixed(2),
    rating: +(Math.random() * 2 + 3).toFixed(1),
    returned: Math.random() < 0.1 ? 1 : 0,
  }));
  // Inject some nulls
  [5, 22, 67, 102].forEach(i => { data[i].revenue = null; });
  return { data, columns: Object.keys(data[0]), filename: 'sample_sales.csv' };
}

function buildIrisDataset() {
  const classes = ['setosa', 'versicolor', 'virginica'];
  const means   = [[5.0, 3.4, 1.5, 0.24], [5.9, 2.8, 4.3, 1.3], [6.6, 3.0, 5.6, 2.0]];
  const data = Array.from({ length: 150 }, (_, i) => {
    const cls  = Math.floor(i / 50);
    const m    = means[cls];
    return {
      sepal_length: +(m[0] + (Math.random() - 0.5) * 0.8).toFixed(2),
      sepal_width:  +(m[1] + (Math.random() - 0.5) * 0.6).toFixed(2),
      petal_length: +(m[2] + (Math.random() - 0.5) * 1.0).toFixed(2),
      petal_width:  +(m[3] + (Math.random() - 0.5) * 0.4).toFixed(2),
      species: classes[cls],
    };
  });
  return { data, columns: Object.keys(data[0]), filename: 'iris_sample.csv' };
}

function buildTitanicDataset() {
  const data = Array.from({ length: 180 }, (_, i) => ({
    PassengerId: i + 1,
    Survived: Math.random() < 0.38 ? 1 : 0,
    Pclass: [1, 2, 3][Math.floor(Math.random() * 3)],
    Sex: Math.random() < 0.5 ? 'male' : 'female',
    Age: Math.random() < 0.07 ? null : +(Math.random() * 60 + 5).toFixed(1),
    SibSp: Math.floor(Math.random() * 4),
    Parch: Math.floor(Math.random() * 3),
    Fare: +(Math.random() * 200 + 5).toFixed(2),
    Embarked: ['S', 'C', 'Q'][Math.floor(Math.random() * 3)],
  }));
  return { data, columns: Object.keys(data[0]), filename: 'titanic_sample.csv' };
}