import importlib.util
from pathlib import Path
import unittest
import tempfile

spec = importlib.util.spec_from_file_location("audit_ui", Path(__file__).with_name("audit-ui.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class JsxNormalizationTest(unittest.TestCase):
    def test_native_controls_remain_visible_to_auditor(self):
        source = '<form><select><option>x</option></select><textarea /></form>'
        self.assertEqual(module.normalize_jsx(source), source)

    def test_form_ownership_and_line_numbers_are_preserved(self):
        source = '<Form<Values>\n noValidate><Form.Item name="x"><Select /></Form.Item></Form>'
        actual = module.normalize_jsx(source)
        self.assertEqual(len(actual), len(source))
        self.assertEqual(actual.count('\n'), source.count('\n'))
        self.assertIn('noValidate', actual)
        self.assertEqual(actual.count('<form'), 1)
        self.assertNotIn('<select', actual)

    def test_animated_and_invalid_forms_are_not_exempt(self):
        actual = module.normalize_jsx('<motion.form onSubmit={send}><Form layout="vertical">')
        self.assertEqual(actual.count('<form'), 2)
        self.assertNotIn('noValidate', actual)

    def test_upstream_rules_still_reject_actual_native_violations(self):
        auditor = module.load_auditor()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'src').mkdir()
            (root / 'src/view.tsx').write_text(
                '<Form<Values> noValidate><Form.Item><Select /></Form.Item></Form>\n'
                '<form><select /></form>', encoding='utf-8')
            findings = auditor.inspect_source(root, {'sourceRoots': ['src'], 'profile': 'marketing-landing',
                'ownership': {'Select/Listbox': 'authored'}})
            rules = [item.rule_id for item in findings]
            self.assertEqual(rules.count('form.novalidate-missing'), 1)
            self.assertEqual(rules.count('ownership.native-select-conflict'), 1)


if __name__ == '__main__':
    unittest.main()
