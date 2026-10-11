/**
 * Moves `onboarding_responses.age_band` from under_40 / 40_64 / 65_plus to
 * under_30 / 30_49 / 50_plus, the bands the questionnaire now asks.
 *
 * The old bands do not map cleanly onto the new ones - "under_40" covers both
 * under_30 and 30_49 - so each old band becomes the OLDEST new band it
 * overlaps. Age only ever restricts a plan, so rounding up can make a stored
 * plan more cautious than it needed to be, never less.
 *
 * Not reversible: 50_plus could have been 40_64 or 65_plus, and nothing
 * recorded which. Down leaves the rows as they are.
 */

export const up = (pgm) => {
  pgm.sql(`
    update onboarding_responses
       set age_band = case age_band
                        when 'under_40' then '30_49'
                        when '40_64'    then '50_plus'
                        when '65_plus'  then '50_plus'
                      end
     where age_band in ('under_40', '40_64', '65_plus')
  `);
};

export const down = () => {};
