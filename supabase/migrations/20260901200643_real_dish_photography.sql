-- Actual food photographs.
--
-- The previous attempt used loremflickr keyword URLs, on the assumption that a
-- keyword would return something resembling the dish. It did not: the menu
-- showed a woman with a tea set, a child at a fairground, and red padding bars
-- where Flickr had no match. Worse than the picsum landscapes it replaced.
--
-- These come from TheMealDB and TheCocktailDB — real, named dishes with stable
-- image URLs and no API key. Every one was looked up by name, so the photo
-- shows food of the right kind. Several are close relatives rather than the
-- dish itself (there is no dosa in the database, so a savoury crepe stands in),
-- which is the honest limit of stock photography.
--
-- All of these remain replaceable from Settings -> Menu, and should be replaced
-- with the property's own photographs before the menu goes in front of guests.

update public.menu_items set image = case name
  -- Savoury crepe; the closest thing to a dosa in the source.
  when 'Set Dosa with Vegetable Kurma'
    then 'https://www.themealdb.com/images/media/meals/eqnf3p1779649407.jpg'
  -- Dal fry: rice and lentils, which is what bisi bele bath is.
  when 'Bisi Bele Bath'
    then 'https://www.themealdb.com/images/media/meals/wuxrtu1483564410.jpg'
  when 'Nandi Hills Filter Coffee'
    then 'https://www.thecocktaildb.com/images/media/drink/wquwxs1441247025.jpg'
  -- Stuffed brinjal with flatbread; matar paneer is the nearest Indian veg curry.
  when 'Akki Roti with Ennegayi'
    then 'https://www.themealdb.com/images/media/meals/xxpqsy1511452222.jpg'
  when 'Verandah Breakfast Plate'
    then 'https://www.themealdb.com/images/media/meals/utxryw1511721587.jpg'
  when 'Charred Corn and Avocado Salad'
    then 'https://www.themealdb.com/images/media/meals/bqx8mc1782684286.jpg'
  when 'Wood-Fired Margherita'
    then 'https://www.themealdb.com/images/media/meals/x0lk931587671540.jpg'
  -- Slow-cooked pork; pandi curry is a pork stew.
  when 'Coorg Pandi Curry with Kadambuttu'
    then 'https://www.themealdb.com/images/media/meals/wxuvuv1511299147.jpg'
  when 'Malnad Chicken Curry Thali'
    then 'https://www.themealdb.com/images/media/meals/yxsurp1511304301.jpg'
  when 'Sanctuary Vegetarian Thali'
    then 'https://www.themealdb.com/images/media/meals/wuxrtu1483564410.jpg'
  when 'Grilled Fish with Verandah Herbs'
    then 'https://www.themealdb.com/images/media/meals/uwxusv1487344500.jpg'
  -- No Indian snack platter in the source; a pickle plate is at least a
  -- savoury side rather than a landscape.
  when 'Masala Peanuts and Papad Basket'
    then 'https://www.themealdb.com/images/media/meals/ppodrp1762325183.jpg'
  -- Bajji are deep-fried fritters.
  when 'Mangalore Bajji with Chutney'
    then 'https://www.themealdb.com/images/media/meals/nmtq3n1782772031.jpg'
  when 'Estate Nilgiri Tea'
    then 'https://www.thecocktaildb.com/images/media/drink/xrsrpr1441247464.jpg'
  when 'Tender Coconut Cooler'
    then 'https://www.thecocktaildb.com/images/media/drink/rytuex1598719770.jpg'
  else image
end
where image like '%loremflickr%' or image like '%picsum%';
