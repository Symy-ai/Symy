-- ============================================================
-- Daily Reflection seed rows i18n — add text_zh column
-- (migration 137, executes after 136)
-- ============================================================

ALTER TABLE public.daily_reflections
  ADD COLUMN IF NOT EXISTS text_zh text;

UPDATE public.daily_reflections SET text_zh = CASE text
  WHEN 'I realized I was buying things to feel in control. Now I journal instead.'
    THEN '我意识到自己买东西是为了找回掌控感。现在我改写日记了。'
  WHEN 'A $200 jacket I already forgot I wanted. Glad I waited.'
    THEN '一件 200 美元的夹克，差点忘了自己曾想要它。幸好等了等。'
  WHEN 'The quiet after not buying was louder than the dopamine of buying.'
    THEN '不买之后的平静，比买了的兴奋更响亮。'
  ELSE text_zh
END
WHERE is_seed = true;
