const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 初始化数据库
const db = new Database(path.join(__dirname, 'data.db'));
db.exec(`
  CREATE TABLE IF NOT EXISTS cells (
    cabinet TEXT NOT NULL,
    row INTEGER NOT NULL,
    col INTEGER NOT NULL,
    project_no TEXT DEFAULT '',
    sample_name TEXT DEFAULT '',
    in_date TEXT DEFAULT '',
    owner TEXT DEFAULT '',
    status TEXT DEFAULT '在柜',
    note TEXT DEFAULT '',
    updated_by TEXT DEFAULT '',
    updated_at TEXT DEFAULT '',
    PRIMARY KEY (cabinet, row, col)
  );
  CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    time TEXT NOT NULL,
    operator TEXT NOT NULL,
    action TEXT NOT NULL
  );
`);

// 柜子配置
const CABINETS = {
  'A1': { rows: 14, cols: 5, name: 'A1 灰柜' },
  'A2': { rows: 25, cols: 5, name: 'A2 蓝柜' },
  '小红': { rows: 10, cols: 6, name: '小红柜' }
};

// 获取所有格子数据
app.get('/api/cells', (req, res) => {
  const rows = db.prepare('SELECT * FROM cells').all();
  const map = {};
  rows.forEach(r => {
    map[`${r.cabinet}-${r.row}-${r.col}`] = r;
  });
  res.json(map);
});

// 保存格子
app.post('/api/cells', (req, res) => {
  const { cabinet, row, col, project_no, sample_name, in_date, owner, status, note, operator } = req.body;
  if (!CABINETS[cabinet]) return res.status(400).json({ error: '无效柜号' });
  if (row < 1 || row > CABINETS[cabinet].rows || col < 1 || col > CABINETS[cabinet].cols) {
    return res.status(400).json({ error: '位置超出范围' });
  }
  const now = new Date().toLocaleString('zh-CN');
  db.prepare(`
    INSERT INTO cells (cabinet, row, col, project_no, sample_name, in_date, owner, status, note, updated_by, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(cabinet, row, col) DO UPDATE SET
      project_no=excluded.project_no,
      sample_name=excluded.sample_name,
      in_date=excluded.in_date,
      owner=excluded.owner,
      status=excluded.status,
      note=excluded.note,
      updated_by=excluded.updated_by,
      updated_at=excluded.updated_at
  `).run(cabinet, row, col, project_no || '', sample_name || '', in_date || '', owner || '', status || '在柜', note || '', operator || '', now);

  // 记录日志
  const action = project_no ? `编辑 ${cabinet}-${row}-${col}（${project_no}）` : `清空 ${cabinet}-${row}-${col}`;
  db.prepare('INSERT INTO logs (time, operator, action) VALUES (?, ?, ?)').run(now, operator || '匿名', action);

  res.json({ ok: true });
});

// 清除格子
app.delete('/api/cells/:cabinet/:row/:col', (req, res) => {
  const { cabinet, row, col } = req.params;
  const operator = req.query.operator || '匿名';
  db.prepare('DELETE FROM cells WHERE cabinet=? AND row=? AND col=?').run(cabinet, row, col);
  const now = new Date().toLocaleString('zh-CN');
  db.prepare('INSERT INTO logs (time, operator, action) VALUES (?, ?, ?)').run(now, operator, `清空 ${cabinet}-${row}-${col}`);
  res.json({ ok: true });
});

// 获取日志
app.get('/api/logs', (req, res) => {
  const rows = db.prepare('SELECT * FROM logs ORDER BY id DESC LIMIT 100').all();
  res.json(rows);
});

// 导出数据
app.get('/api/export', (req, res) => {
  const rows = db.prepare('SELECT * FROM cells').all();
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="sample-cabinet-backup.json"');
  res.send(JSON.stringify(rows, null, 2));
});

app.listen(PORT, () => {
  console.log(`样品柜管理系统已启动: http://localhost:${PORT}`);
});
