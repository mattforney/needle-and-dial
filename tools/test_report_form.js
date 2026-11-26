// Checks the Report link's issue form, .github/ISSUE_TEMPLATE/report.yml, against GitHub's form
// schema as documented (GitHub only reports a bad form once it is on the default branch), and that
// the fields the page fills in (reportURL in src/index.template.html) are the form's fields.
//
//   node tools/test_report_form.js
//
// Needs the yaml dev package (npm install).
const fs = require('fs');
const path = require('path');
const YAML = require('yaml');

const ROOT = path.join(__dirname, '..');
const FORM = '.github/ISSUE_TEMPLATE/report.yml';
const problems = [];
const bad = (m) => problems.push(m);

// ---- the form, against https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/syntax-for-githubs-form-schema
const doc = YAML.parseDocument(fs.readFileSync(path.join(ROOT, FORM), 'utf8'));
for (const e of doc.errors) bad('YAML: ' + e.message);
const form = doc.toJS() || {};
const TOP = ['name', 'description', 'title', 'labels', 'assignees', 'projects', 'type', 'body'];
const ATTRS = {
  markdown: ['value'],
  input: ['label', 'description', 'placeholder', 'value'],
  textarea: ['label', 'description', 'placeholder', 'value', 'render'],
  dropdown: ['label', 'description', 'multiple', 'options', 'default'],
  checkboxes: ['label', 'description', 'options'],
};
const VALID = { input: ['required', 'min_length'], textarea: ['required', 'min_length'], dropdown: ['required'], checkboxes: ['required'] };
for (const k of Object.keys(form)) if (!TOP.includes(k)) bad(`unknown top-level key "${k}"`);
for (const k of ['name', 'description']) if (typeof form[k] !== 'string' || !form[k].trim()) bad(`"${k}" must be a non-empty string`);
if (!(Array.isArray(form.labels) && form.labels.includes('report'))) bad('the form should label its issues "report"');
const body = Array.isArray(form.body) ? form.body : [];
if (!body.length) bad('"body" must be a list of fields');
if (!body.some((el) => el && el.type !== 'markdown')) bad('the form needs at least one field that is not markdown');
const ids = new Set(), labels = new Set();
body.forEach((el, i) => {
  const at = `body[${i}]${el && el.id ? ' (' + el.id + ')' : ''}`;
  if (!el || !ATTRS[el.type]) return bad(`${at}: unknown type "${el && el.type}"`);
  for (const k of Object.keys(el)) if (!['type', 'id', 'attributes', 'validations'].includes(k)) bad(`${at}: unknown key "${k}"`);
  const a = el.attributes || {};
  for (const k of Object.keys(a)) if (!ATTRS[el.type].includes(k)) bad(`${at}: "${k}" is not an attribute of ${el.type}`);
  if (el.type === 'markdown') {
    if (el.id !== undefined) bad(`${at}: markdown takes no id`);
    if (typeof a.value !== 'string' || !a.value.trim()) bad(`${at}: markdown needs a value`);
    if (el.validations) bad(`${at}: markdown takes no validations`);
    return;
  }
  if (el.id !== undefined) {
    if (typeof el.id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(el.id)) bad(`${at}: an id may use only letters, digits, - and _`);
    if (ids.has(el.id)) bad(`${at}: id used twice`);
    ids.add(el.id);
  }
  if (typeof a.label !== 'string' || !a.label.trim()) bad(`${at}: needs a label`);
  else { if (labels.has(a.label)) bad(`${at}: label used twice`); labels.add(a.label); }
  if (el.type === 'dropdown' || el.type === 'checkboxes') {
    const opts = Array.isArray(a.options) ? a.options.map((o) => (el.type === 'checkboxes' && o ? o.label : o)) : [];
    if (!opts.length) bad(`${at}: needs options`);
    if (opts.some((o) => typeof o !== 'string' || !o.trim())) bad(`${at}: every option needs text`);
    if (new Set(opts).size !== opts.length) bad(`${at}: options must differ`);
    if (a.default !== undefined && (!Number.isInteger(a.default) || a.default < 0 || a.default >= opts.length)) bad(`${at}: default must be an option's index`);
    if (a.default !== undefined && opts.some((o) => /^(none|n\/a)$/i.test(o))) bad(`${at}: with a default, "None" and "n/a" are not allowed as options`);
  }
  for (const [k, v] of Object.entries(el.validations || {})) {
    if (!VALID[el.type].includes(k)) bad(`${at}: "${k}" is not a validation of ${el.type}`);
    else if (k === 'required' && typeof v !== 'boolean') bad(`${at}: required must be true or false`);
    else if (k === 'min_length' && !(Number.isInteger(v) && v >= 0)) bad(`${at}: min_length must be a whole number`);
  }
});
for (const k of ['reason', 'station', 'aired']) { const el = body.find((x) => x && x.id === k); if (!el || !(el.validations && el.validations.required)) bad(`"${k}" should be a required field`); }

// ---- the page fills in exactly the form's detail fields
const tpl = fs.readFileSync(path.join(ROOT, 'src/index.template.html'), 'utf8');
const form_url = /const REPORT_FORM = '([^']+)'/.exec(tpl);
if (!form_url || !/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/issues\/new$/.test(form_url[1])) bad("REPORT_FORM should be a repository's new-issue address");
const fn = /function reportURL\(\) \{[\s\S]*?\n\}/.exec(tpl);
const block = fn && /Object\.assign\(q, \{([\s\S]*?)\n\s*\}\);/.exec(fn[0]);
if (!fn || !block) bad('could not find the fields reportURL fills in');
else {
  if (!fn[0].includes(`template: '${path.basename(FORM)}'`)) bad(`reportURL should name the form ${path.basename(FORM)}`);
  const filled = [...block[1].matchAll(/^\s*(\w+):/gm)].map((m) => m[1]).filter((k) => k !== 'title'); // title is the issue's own title
  for (const k of filled) if (!ids.has(k)) bad(`the page fills in "${k}", which the form doesn't have`);
  for (const el of body) if (el && (el.type === 'input' || el.type === 'textarea') && el.id !== 'note' && !filled.includes(el.id)) bad(`the form's "${el.id}" is never filled in by the page`);
}

for (const p of problems) console.log('FAIL  ' + p);
console.log(problems.length ? `${problems.length} problem${problems.length > 1 ? 's' : ''} with the report form` : `report form OK: ${ids.size} fields, ${body.filter((x) => x && x.type === 'input').length} filled in by the page`);
process.exitCode = problems.length ? 1 : 0;
