export const COUNTRY_GROUPS = [
  {
    label: "East Africa",
    countries: ["Kenya", "Uganda", "Tanzania", "Rwanda", "Burundi", "Ethiopia", "Somalia", "South Sudan", "Sudan"],
  },
  {
    label: "Africa (Other)",
    countries: ["Nigeria", "South Africa", "Ghana", "Zambia", "Zimbabwe", "Malawi", "Mozambique", "Botswana", "Namibia"],
  },
  {
    label: "International",
    countries: ["United Kingdom", "United States", "Canada", "Australia", "India", "United Arab Emirates"],
  },
] as const;

export const COUNTRY_OPTIONS: string[] = COUNTRY_GROUPS.flatMap((g) => [...g.countries]);

export const STATE_MAP: Record<string, string[]> = {
  Kenya: [
    "Baringo", "Bomet", "Bungoma", "Busia", "Elgeyo-Marakwet", "Embu", "Garissa", "Homa Bay", "Isiolo",
    "Kajiado", "Kakamega", "Kericho", "Kiambu", "Kilifi", "Kirinyaga", "Kisii", "Kisumu", "Kitui",
    "Kwale", "Laikipia", "Lamu", "Machakos", "Makueni", "Mandera", "Marsabit", "Meru", "Migori",
    "Mombasa", "Murang'a", "Nairobi", "Nakuru", "Nandi", "Narok", "Nyamira", "Nyandarua", "Nyeri",
    "Samburu", "Siaya", "Taita-Taveta", "Tana River", "Tharaka-Nithi", "Trans Nzoia", "Turkana",
    "Uasin Gishu", "Vihiga", "Wajir", "West Pokot",
  ],
  Uganda: ["Central", "Eastern", "Northern", "Western"],
  Tanzania: ["Arusha", "Dar es Salaam", "Dodoma", "Geita", "Iringa", "Kagera", "Katavi", "Kigoma", "Kilimanjaro", "Lindi", "Manyara", "Mara", "Mbeya", "Mjini Magharibi", "Morogoro", "Mtwara", "Mwanza", "Njombe", "Pemba North", "Pemba South", "Pwani", "Rukwa", "Ruvuma", "Shinyanga", "Simiyu", "Singida", "Songwe", "Tabora", "Tanga"],
  Rwanda: ["Eastern", "Kigali", "Northern", "Southern", "Western"],
  Burundi: ["Bujumbura Mairie", "Bujumbura Rural", "Bururi", "Cankuzo", "Cibitoke", "Gitega", "Karuzi", "Kayanza", "Kirundo", "Makamba", "Muramvya", "Muyinga", "Mwaro", "Ngozi", "Rumonge", "Rutana", "Ruyigi"],
  Ethiopia: ["Addis Ababa", "Afar", "Amhara", "Benishangul-Gumuz", "Dire Dawa", "Gambela", "Harari", "Oromia", "Sidama", "Somali", "South Ethiopia", "South West Ethiopia", "Tigray"],
  Somalia: ["Awdal", "Bakool", "Banaadir", "Bari", "Bay", "Galguduud", "Gedo", "Hiiraan", "Jubbada Dhexe", "Jubbada Hoose", "Mudug", "Nugaal", "Sanaag", "Shabeellaha Dhexe", "Shabeellaha Hoose", "Sool", "Togdheer", "Woqooyi Galbeed"],
  "South Sudan": ["Central Equatoria", "Eastern Equatoria", "Jonglei", "Lakes", "Northern Bahr el Ghazal", "Unity", "Upper Nile", "Warrap", "Western Bahr el Ghazal", "Western Equatoria"],
  Sudan: ["Al Jazirah", "Al Qadarif", "Blue Nile", "Central Darfur", "East Darfur", "Kassala", "Khartoum", "North Darfur", "North Kordofan", "Northern", "Red Sea", "River Nile", "Sennar", "South Darfur", "South Kordofan", "West Darfur", "West Kordofan", "White Nile"],
  Nigeria: ["Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa", "Benue", "Borno", "Cross River", "Delta", "Ebonyi", "Edo", "Ekiti", "Enugu", "Gombe", "Imo", "Jigawa", "Kaduna", "Kano", "Katsina", "Kebbi", "Kogi", "Kwara", "Lagos", "Nasarawa", "Niger", "Ogun", "Ondo", "Osun", "Oyo", "Plateau", "Rivers", "Sokoto", "Taraba", "Yobe", "Zamfara", "FCT"],
  "South Africa": ["Eastern Cape", "Free State", "Gauteng", "KwaZulu-Natal", "Limpopo", "Mpumalanga", "North West", "Northern Cape", "Western Cape"],
  Ghana: ["Ahafo", "Ashanti", "Bono", "Bono East", "Central", "Eastern", "Greater Accra", "North East", "Northern", "Oti", "Savannah", "Upper East", "Upper West", "Volta", "Western", "Western North"],
  Zambia: ["Central", "Copperbelt", "Eastern", "Luapula", "Lusaka", "Muchinga", "North-Western", "Northern", "Southern", "Western"],
  Zimbabwe: ["Bulawayo", "Harare", "Manicaland", "Mashonaland Central", "Mashonaland East", "Mashonaland West", "Masvingo", "Matabeleland North", "Matabeleland South", "Midlands"],
  Malawi: ["Central", "Northern", "Southern"],
  Mozambique: ["Cabo Delgado", "Gaza", "Inhambane", "Manica", "Maputo", "Maputo City", "Nampula", "Niassa", "Sofala", "Tete", "Zambezia"],
  Botswana: ["Central", "Ghanzi", "Kgalagadi", "Kgatleng", "Kweneng", "North East", "North West", "South East", "Southern"],
  Namibia: ["Erongo", "Hardap", "Kavango East", "Kavango West", "Karas", "Khomas", "Kunene", "Ohangwena", "Omaheke", "Omusati", "Oshana", "Oshikoto", "Otjozondjupa", "Zambezi"],
  "United Kingdom": ["England", "Northern Ireland", "Scotland", "Wales"],
  "United States": ["Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut", "Delaware", "Florida", "Georgia", "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire", "New Jersey", "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio", "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina", "South Dakota", "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington", "West Virginia", "Wisconsin", "Wyoming", "District of Columbia"],
  Canada: ["Alberta", "British Columbia", "Manitoba", "New Brunswick", "Newfoundland and Labrador", "Northwest Territories", "Nova Scotia", "Nunavut", "Ontario", "Prince Edward Island", "Quebec", "Saskatchewan", "Yukon"],
  Australia: ["Australian Capital Territory", "New South Wales", "Northern Territory", "Queensland", "South Australia", "Tasmania", "Victoria", "Western Australia"],
  India: ["Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal"],
  "United Arab Emirates": ["Abu Dhabi", "Ajman", "Dubai", "Fujairah", "Ras Al Khaimah", "Sharjah", "Umm Al Quwain"],
};
