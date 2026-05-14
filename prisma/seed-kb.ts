import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding Knowledge Base with categories and articles...');

  const users = await prisma.user.findMany({ take: 1 });
  if (users.length === 0) {
    console.error('No users found. Run `npx prisma db seed` first.');
    process.exit(1);
  }
  const authorId = users[0].id;

  // Clean existing KB data
  await prisma.knowledgeArticle.deleteMany();
  await prisma.knowledgeCategory.deleteMany();

  const categories = [
    {
      nameAr: 'تقنية المعلومات',
      nameEn: 'Information Technology',
      articles: [
        { titleAr: 'كيفية إعادة تعيين كلمة المرور', titleEn: 'How to Reset Your Password', contentAr: 'لإعادة تعيين كلمة المرور، انتقل إلى صفحة تسجيل الدخول وانقر على "نسيت كلمة المرور". أدخل بريدك الإلكتروني المسجل واتبع التعليمات المرسلة إلى بريدك. إذا واجهت أي مشكلة، اتصل بقسم تقنية المعلومات.', contentEn: 'To reset your password, go to the login page and click "Forgot Password". Enter your registered email and follow the instructions sent to your inbox. If you encounter any issues, contact the IT department.' },
        { titleAr: 'إعداد البريد الإلكتروني على الجوال', titleEn: 'Setting Up Email on Mobile', contentAr: 'لإعداد البريد الإلكتروني على هاتفك المحمول، انتقل إلى الإعدادات > إضافة حساب. اختر "Exchange" أو "Outlook". أدخل عنوان بريدك الإلكتروني وكلمة المرور. تأكد من تفعيل المزامنة للبريد والتقويم وجهات الاتصال.', contentEn: 'To set up email on your mobile device, go to Settings > Add Account. Select "Exchange" or "Outlook". Enter your email address and password. Make sure to enable syncing for mail, calendar, and contacts.' },
        { titleAr: 'تثبيت البرامج والتطبيقات', titleEn: 'Software and Application Installation', contentAr: 'جميع البرامج المؤسسية متاحة عبر متجر الشركة (Company Portal). يمكنك تنزيل Microsoft Office، أدوبي أكروبات، وبرامج مكافحة الفيروسات. للبرامج المتخصصة، قدم طلب دعم عبر نظام التذاكر.', contentEn: 'All enterprise software is available through the Company Portal. You can download Microsoft Office, Adobe Acrobat, and antivirus software. For specialized software, submit a support request through the ticketing system.' },
        { titleAr: 'الاتصال بشبكة الواي فاي', titleEn: 'Connecting to WiFi Network', contentAr: 'اختر شبكة "ABCH-Staff" من قائمة الشبكات المتاحة. استخدم بيانات تسجيل الدخول الموحدة (نفس بيانات الدخول إلى النظام). إذا واجهت مشكلة في الاتصال، تأكد من تفعيل خيار DHCP في إعدادات الشبكة.', contentEn: 'Select "ABCH-Staff" from the available networks list. Use your unified login credentials (same as system login). If you face connection issues, make sure DHCP is enabled in your network settings.' },
        { titleAr: 'الإبلاغ عن مشكلة تقنية', titleEn: 'Reporting a Technical Issue', contentAr: 'لإبلاغ قسم تقنية المعلومات عن مشكلة تقنية، استخدم نظام التذاكر الإلكتروني. يرجى تقديم وصف تفصيلي للمشكلة، رقم الغرفة، ورقم الاتصال. سنقوم بالرد عليك في أقرب وقت ممكن.', contentEn: 'To report a technical issue to IT, use the electronic ticketing system. Please provide a detailed description of the issue, room number, and contact number. We will respond to you as soon as possible.' },
        { titleAr: 'أمن المعلومات وكلمات المرور', titleEn: 'Information Security and Passwords', contentAr: 'يجب تغيير كلمة المرور كل 90 يوماً. استخدم كلمة مرور قوية تحتوي على حروف كبيرة وصغيرة وأرقام ورموز. لا تشارك كلمة المرور مع أي شخص. أبلغ قسم تقنية المعلومات فوراً إذا اعتقدت أن كلمة مرورك قد تم اختراقها.', contentEn: 'Passwords must be changed every 90 days. Use a strong password containing uppercase and lowercase letters, numbers, and symbols. Do not share your password with anyone. Report immediately to IT if you believe your password has been compromised.' },
      ]
    },
    {
      nameAr: 'الصيانة الهندسية',
      nameEn: 'Engineering Maintenance',
      articles: [
        { titleAr: 'الإبلاغ عن أعطال التكييف', titleEn: 'Reporting AC Malfunctions', contentAr: 'في حالة وجود عطل في جهاز التكييف، يرجى تقديم طلب صيانة عبر النظام مع ذكر رقم الغرفة ووصف المشكلة. ستقوم فرق الصيانة بمعاينة العطل خلال 24 ساعة عمل.', contentEn: 'In case of an AC malfunction, please submit a maintenance request through the system mentioning the room number and problem description. Maintenance teams will inspect the fault within 24 working hours.' },
        { titleAr: 'صيانة السباكة والكهرباء', titleEn: 'Plumbing and Electrical Maintenance', contentAr: 'للاستفسارات المتعلقة بالسباكة والكهرباء، يرجى الاتصال بقسم الصيانة الهندسية عبر نظام التذاكر. تتوفر خدمة الطوارئ على مدار الساعة للحالات العاجلة مثل تسرب المياه أو انقطاع التيار الكهربائي.', contentEn: 'For plumbing and electrical inquiries, please contact Engineering Maintenance through the ticketing system. Emergency service is available 24/7 for urgent cases such as water leaks or power outages.' },
        { titleAr: 'صيانة الأثاث والمباني', titleEn: 'Furniture and Building Maintenance', contentAr: 'يمكنك طلب صيانة الأثاث من خلال رفع طلب صيانة يوضح القطعة المراد صيانتها وموقعها. سيتم جدولة الزيارة خلال 48 ساعة. للإصلاحات العاجلة، يرجى الإشارة إلى ذلك في الطلب.', contentEn: 'You can request furniture maintenance by submitting a request specifying the item and its location. The visit will be scheduled within 48 hours. For urgent repairs, please indicate so in the request.' },
        { titleAr: 'السلامة والطوارئ', titleEn: 'Safety and Emergency Procedures', contentAr: 'في حالات الطوارئ، اتصل بالرقم الداخلي 9999. تعرف على مخارج الطوارئ ونقاط التجمع في المبنى الخاص بك. يجب إجراء تدريبات الإخلاء بانتظام. أبلغ عن أي مخاطر سلامة فوراً.', contentEn: 'In emergencies, call extension 9999. Familiarize yourself with emergency exits and assembly points in your building. Evacuation drills must be conducted regularly. Report any safety hazards immediately.' },
      ]
    },
    {
      nameAr: 'الموارد البشرية',
      nameEn: 'Human Resources',
      articles: [
        { titleAr: 'طلب إجازة سنوية', titleEn: 'Requesting Annual Leave', contentAr: 'لتقديم طلب إجازة سنوية، سجل الدخول إلى نظام الموارد البشرية واختر "طلبات الإجازات". اختر نوع الإجازة والتاريخ. يجب تقديم الطلب قبل أسبوعين على الأقل. ستصلك رسالة تأكيد بعد الموافقة.', contentEn: 'To submit an annual leave request, log in to the HR system and select "Leave Requests". Choose the leave type and dates. Requests must be submitted at least two weeks in advance. You will receive a confirmation message upon approval.' },
        { titleAr: 'سياسة الحضور والانصراف', titleEn: 'Attendance and Departure Policy', contentAr: 'ساعات العمل الرسمية من 7:30 صباحاً إلى 3:30 مساءً. يجب تسجيل الحضور والانصراف عبر بصمة الإصبع. التأخير أكثر من 15 دقيقة يحتاج إلى موافقة المشرف المباشر.', contentEn: 'Official working hours are from 7:30 AM to 3:30 PM. Attendance and departure must be recorded via fingerprint. Being late by more than 15 minutes requires direct supervisor approval.' },
        { titleAr: 'التدريب والتطوير المهني', titleEn: 'Training and Professional Development', contentAr: 'يوفر قسم الموارد البشرية برامج تدريبية مستمرة للموظفين. يمكنكم التسجيل في الدورات المتاحة عبر النظام الإلكتروني. يتم توثيق ساعات التدريب في ملف الموظف.', contentEn: 'The HR department provides ongoing training programs for employees. You can register for available courses through the electronic system. Training hours are documented in the employee file.' },
      ]
    },
    {
      nameAr: 'الهندسة الطبية',
      nameEn: 'Biomedical Engineering',
      articles: [
        { titleAr: 'صيانة الأجهزة الطبية الدورية', titleEn: 'Periodic Medical Equipment Maintenance', contentAr: 'يتم تنفيذ الصيانة الدورية لجميع الأجهزة الطبية حسب جدول زمني محدد. يجب إبلاغ القسم قبل 48 ساعة من موعد الصيانة. في حالة وجود جهاز معطل، يرجى تقديم بلاغ عاجل عبر النظام.', contentEn: 'Periodic maintenance for all medical devices is carried out according to a specific schedule. The department must be notified 48 hours before the maintenance date. For malfunctioning equipment, please submit an urgent report through the system.' },
        { titleAr: 'استعارة الأجهزة الطبية', titleEn: 'Borrowing Medical Devices', contentAr: 'يمكن استعارة الأجهزة الطبية من قسم الهندسة الطبية بعد تعبئة نموذج الاستعارة. مدة الاستعارة القصوى 7 أيام قابلة للتجديد. المستعير مسؤول عن سلامة الجهاز.', contentEn: 'Medical devices can be borrowed from Biomedical Engineering after filling out the borrowing form. The maximum borrowing period is 7 days, renewable. The borrower is responsible for the device\'s safety.' },
        { titleAr: 'التخلص من الأجهزة المنتهية', titleEn: 'Disposal of Expired Devices', contentAr: 'للتخلص من الأجهزة الطبية المنتهية الصلاحية، يرجى التواصل مع قسم الهندسة الطبية. يجب توثيق عملية التخلص وفق الإجراءات المعتمدة واللوائح البيئية.', contentEn: 'For disposal of expired medical devices, please contact Biomedical Engineering. The disposal process must be documented according to approved procedures and environmental regulations.' },
      ]
    },
    {
      nameAr: 'الشؤون المالية',
      nameEn: 'Finance',
      articles: [
        { titleAr: 'مصاريف السفر والانتقال', titleEn: 'Travel and Transportation Expenses', contentAr: 'لتقديم طلب تعويض مصاريف السفر، يرجى تعبئة نموذج مصاريف السفر مرفقاً بالفواتير الأصلية. يجب تقديم الطلب خلال 30 يوماً من تاريخ الصرف. تتم الموافقة من قبل المشرف المباشر ثم إدارة الشؤون المالية.', contentEn: 'To submit a travel expense reimbursement request, fill out the travel expense form with original receipts. The request must be submitted within 30 days of the expense date. Approval is required from the direct supervisor then Finance.' },
        { titleAr: 'المشتريات والعروض', titleEn: 'Purchases and Quotations', contentAr: 'للمشتريات التي تتجاوز 10,000 ريال، يجب الحصول على 3 عروض أسعار على الأقل. يتم تقديم طلب الشراء عبر النظام مع إرفاق العروض. مدة المعالجة من 5 إلى 10 أيام عمل.', contentEn: 'For purchases exceeding 10,000 SAR, at least 3 price quotations must be obtained. The purchase request is submitted through the system with attached quotations. Processing time is 5-10 working days.' },
      ]
    },
    {
      nameAr: 'التمريض',
      nameEn: 'Nursing',
      articles: [
        { titleAr: 'إجراءات مكافحة العدوى', titleEn: 'Infection Control Procedures', contentAr: 'يجب اتباع إجراءات مكافحة العدوى بدقة بما في ذلك تعقيم اليدين قبل وبعد التعامل مع المرضى، استخدام القفازات الواقية، والتخلص الآمن من النفايات الطبية. يتم تدريب جميع الممرضين على هذه الإجراءات.', contentEn: 'Infection control procedures must be strictly followed including hand sanitization before and after patient contact, use of protective gloves, and safe disposal of medical waste. All nurses are trained on these procedures.' },
        { titleAr: 'التعامل مع المرضى', titleEn: 'Patient Care Guidelines', contentAr: 'يجب التعامل مع جميع المرضى باحترام وكرامة. الحفاظ على خصوصية المرضى وسرية معلوماتهم الطبية. التواصل الفعال مع المرضى وذويهم لشرح الإجراءات والخطط العلاجية.', contentEn: 'All patients must be treated with respect and dignity. Maintain patient privacy and confidentiality of their medical information. Communicate effectively with patients and their families to explain procedures and treatment plans.' },
      ]
    },
    {
      nameAr: 'الصيدلية',
      nameEn: 'Pharmacy',
      articles: [
        { titleAr: 'صرف الأدوية للمرضى', titleEn: 'Medication Dispensing for Patients', contentAr: 'يتم صرف الأدوية بناءً على وصفة طبية سارية. يجب التحقق من هوية المريض والجرعة الموصوفة. تسليم الدواء مع التعليمات المناسبة للاستخدام. توثيق جميع عمليات الصرف في النظام.', contentEn: 'Medications are dispensed based on a valid prescription. Patient identity and prescribed dosage must be verified. Deliver medication with appropriate usage instructions. Document all dispensing transactions in the system.' },
        { titleAr: 'الأدوية المخزنة والطارئة', titleEn: 'Stock and Emergency Medications', contentAr: 'يحتفظ بقائمة الأدوية الأساسية والطارئة في الصيدلية على مدار الساعة. يتم مراقبة المخزون يومياً لضمان توفر الأدوية الحيوية. للإبلاغ عن نقص في الأدوية، يرجى التواصل مع مدير الصيدلية.', contentEn: 'A list of essential and emergency medications is maintained in the pharmacy around the clock. Inventory is monitored daily to ensure availability of vital medications. To report medication shortages, contact the Pharmacy Manager.' },
      ]
    },
    {
      nameAr: 'الأشعة',
      nameEn: 'Radiology',
      articles: [
        { titleAr: 'تحويل المرضى للأشعة', titleEn: 'Referring Patients to Radiology', contentAr: 'يجب تعبئة نموذج تحويل الأشعة من قبل الطبيب المعالج موضحاً نوع الفحص المطلوب والمنطقة المراد تصويرها. يتم إرسال التحويل إلكترونياً إلى قسم الأشعة.', contentEn: 'The radiology referral form must be completed by the treating physician specifying the required examination type and area to be imaged. The referral is sent electronically to the Radiology department.' },
        { titleAr: 'نتائج الأشعة والتقارير', titleEn: 'Radiology Results and Reports', contentAr: 'نتائج الأشعة متاحة إلكترونياً خلال 24 ساعة من إجراء الفحص. يمكن للأطباء المعالجين الاطلاع على الصور والتقارير عبر نظام معلومات الأشعة (RIS).', contentEn: 'Radiology results are available electronically within 24 hours of the examination. Treating physicians can view images and reports through the Radiology Information System (RIS).' },
      ]
    },
    {
      nameAr: 'المختبر',
      nameEn: 'Laboratory',
      articles: [
        { titleAr: 'إجراء الفحوصات المخبرية', titleEn: 'Performing Laboratory Tests', contentAr: 'يتم إجراء الفحوصات المخبرية حسب طلب الطبيب المعالج. يجب تحضير المريض بشكل مناسب حسب نوع الفحص. النتائج متاحة إلكترونياً بعد اعتمادها من أخصائي المختبر.', contentEn: 'Laboratory tests are performed as requested by the treating physician. The patient must be properly prepared according to the test type. Results are available electronically after approval by the laboratory specialist.' },
        { titleAr: 'جمع العينات ونقلها', titleEn: 'Sample Collection and Transport', contentAr: 'يجب جمع العينات في حاويات معقمة ومناسبة. وضع ملصق على كل عينة يتضمن اسم المريض ورقمه الطبي. نقل العينات إلى المختبر في أسرع وقت ممكن مع الحفاظ على سلسلة التبريد عند الحاجة.', contentEn: 'Samples must be collected in sterile, appropriate containers. Label each sample with the patient\'s name and medical number. Transport samples to the laboratory as soon as possible while maintaining the cold chain when needed.' },
      ]
    },
  ];

  for (const cat of categories) {
    const created = await prisma.knowledgeCategory.create({
      data: {
        nameAr: cat.nameAr,
        nameEn: cat.nameEn,
        articles: {
          create: cat.articles.map(a => ({
            titleAr: a.titleAr,
            titleEn: a.titleEn,
            contentAr: a.contentAr,
            contentEn: a.contentEn,
            authorId,
          }))
        }
      },
    });
    console.log(`  ✓ ${cat.nameEn} — ${cat.articles.length} articles`);
  }

  const totalCategories = categories.length;
  const totalArticles = categories.reduce((s, c) => s + c.articles.length, 0);
  console.log(`\n✅ Knowledge Base seeded successfully!`);
  console.log(`   Categories: ${totalCategories}`);
  console.log(`   Articles: ${totalArticles}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
