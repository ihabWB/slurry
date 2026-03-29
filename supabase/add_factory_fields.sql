-- Add tag_number and waste_type to factories table
ALTER TABLE factories
  ADD COLUMN IF NOT EXISTS tag_number TEXT,
  ADD COLUMN IF NOT EXISTS waste_type TEXT CHECK (waste_type IN ('liquid', 'solid'));
