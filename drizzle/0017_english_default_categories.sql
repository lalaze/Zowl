-- Translate built-in labels without changing category identities or user-created names.
-- Find an unused English suffix if a custom category already owns the target name.
WITH translations(old_name, new_name) AS (
  VALUES
    ('餐饮', 'Food'),
    ('外卖', 'Delivery'),
    ('交通', 'Transport'),
    ('购物', 'Shopping'),
    ('娱乐', 'Entertainment'),
    ('居住', 'Housing'),
    ('医疗', 'Healthcare'),
    ('教育', 'Education'),
    ('数码', 'Electronics'),
    ('转账', 'Transfer'),
    ('红包', 'Red packets'),
    ('工资', 'Salary'),
    ('退款', 'Refund'),
    ('其他', 'Other')
)
UPDATE categories AS target
SET name = (
  WITH RECURSIVE candidates(number, name) AS (
    SELECT 0, translations.new_name FROM translations WHERE old_name = target.name
    UNION ALL
    SELECT number + 1, translations.new_name || ' (built-in ' || (number + 1) || ')'
    FROM candidates, translations
    WHERE translations.old_name = target.name
      AND EXISTS (
        SELECT 1 FROM categories AS occupied
        WHERE occupied.user_id = target.user_id AND occupied.name = candidates.name
      )
  )
  SELECT name FROM candidates
  WHERE NOT EXISTS (
    SELECT 1 FROM categories AS occupied
    WHERE occupied.user_id = target.user_id AND occupied.name = candidates.name
  )
  ORDER BY number LIMIT 1
)
WHERE is_system = 1 AND name IN (SELECT old_name FROM translations);
