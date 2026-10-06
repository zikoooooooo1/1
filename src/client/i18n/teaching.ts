export const teachingMessages: Record<string, [string, string]> = {
  complete_teaching_setup: ['Complete your teaching setup', 'أكمل إعداد حسابك التعليمي'],
  teaching_setup_intro: [
    'Choose your subjects and the sections you teach. CLASO will connect your classes to the school roster.',
    'اختر موادك والشعب التي تدرّسها. سيربط كلاسو فصولك بطلاب المدرسة المسجّلين.',
  ],
  selection_limit: [
    'Choose at most 100 teaching classes in one setup.',
    'اختر بحد أقصى ١٠٠ فصل تعليمي في الإعداد الواحد.',
  ],
  invalid_subject: [
    'This subject is no longer available. Reload the setup.',
    'هذه المادة لم تعد متاحة. أعد تحميل الإعداد.',
  ],
  teacher_setup_required: [
    'Complete your teaching setup to continue.',
    'أكمل إعداد التدريس للمتابعة.',
  ],
  setup_subjects: ['What subjects do you teach?', 'ما المواد التي تدرّسها؟'],
  setup_grades: ['What grades do you teach?', 'ما الصفوف التي تدرّسها؟'],
  setup_sections: ['Choose tracks and sections for each subject', 'اختر المسارات والشعب لكل مادة'],
  setup_review: ['Review your teaching classes', 'راجع فصولك التعليمية'],
  setup_subject_help: [
    'Select every subject you teach. You can choose different sections for each subject.',
    'اختر كل المواد التي تدرّسها. يمكنك تخصيص شعب مختلفة لكل مادة.',
  ],
  setup_section_help: [
    'Only sections in the imported school roster are shown. Selecting a section gives you teaching access to its enrolled students.',
    'تظهر الشعب الموجودة في كشف المدرسة. اختيار الشعبة يتيح لك متابعة طلابها تعليميًا.',
  ],
  setup_confirm: [
    'I confirm these are the subjects and sections I am assigned to teach.',
    'أؤكد أن هذه المواد والشعب هي التي أُكلّف بتدريسها.',
  ],
  setup_create_classes: ['Confirm and open my classes', 'تأكيد وفتح فصولي'],
  setup_class_count: ['Teaching classes to connect', 'الفصول التي سيتم ربطها'],
  setup_waiting: [
    'Your school is preparing its academic calendar',
    'المدرسة تستكمل إعداد التقويم الدراسي',
  ],
  setup_waiting_help: [
    'An administrator needs to connect the imported roster to an active academic year and term. Your account is ready; check again once the calendar is configured.',
    'يحتاج الأدمن إلى ربط كشف الطلاب بعام وفصل دراسي نشط. حسابك جاهز؛ أعد المحاولة بعد إعداد التقويم.',
  ],
  no_track: ['No track', 'بدون مسار'],
  track_Advanced: ['Advanced', 'متقدم'],
  track_General: ['General', 'عام'],
  subject_PHY: ['Physics', 'الفيزياء'],
  subject_CHEM: ['Chemistry', 'الكيمياء'],
  subject_AR: ['Arabic', 'اللغة العربية'],
  subject_EN: ['English', 'اللغة الإنجليزية'],
  subject_MATH: ['Mathematics', 'الرياضيات'],
  subject_ISLAM: ['Islamic Studies', 'التربية الإسلامية'],
  subject_SOCIAL: ['Social Studies', 'الدراسات الاجتماعية'],
  roster_management: ['School roster', 'كشف طلاب المدرسة'],
  roster_pending_help: [
    'Connect this roster to the correct active year and term before teachers complete their setup. Academic dates must match the school calendar.',
    'اربط الكشف بالعام والفصل الدراسي الصحيح قبل إكمال إعداد المعلمين. يجب أن تطابق التواريخ تقويم المدرسة.',
  ],
  roster_activate: ['Activate roster', 'تفعيل كشف الطلاب'],
  roster_activation_confirm: [
    'Activate this roster for the selected year and term? Teachers will be able to connect their classes to its students.',
    'تفعيل الكشف للعام والفصل المحددين؟ سيتمكن المعلمون من ربط فصولهم بالطلاب الواردين فيه.',
  ],
  roster_not_ready: [
    'The school roster is not active yet. Ask the administrator to configure the academic calendar.',
    'كشف المدرسة لم يُفعّل بعد. اطلب من الأدمن إعداد التقويم الدراسي.',
  ],
  invalid_roster_group: [
    'The selected section is not available in this roster.',
    'الشعبة المحددة غير متاحة في هذا الكشف.',
  ],
  setup_already_complete: [
    'Teaching setup is complete. Contact the administrator to change assignments.',
    'اكتمل إعداد التدريس. تواصل مع الأدمن لتعديل التوزيع.',
  ],
  active_roster_exists: ['There is already an active roster.', 'يوجد كشف طلاب نشط بالفعل.'],
  roster_already_activated: [
    'This roster has already been activated.',
    'تم تفعيل هذا الكشف من قبل.',
  ],
  invalid_academic_context: [
    'Choose a term belonging to the active academic year.',
    'اختر فصلًا دراسيًا تابعًا للعام النشط.',
  ],
  student_number: ['Student number', 'رقم الطالب'],
  name_ar: ['Arabic name', 'الاسم بالعربية'],
  name_en: ['English name', 'الاسم بالإنجليزية'],
  login_id: ['Username', 'اسم المستخدم'],
  teacher_credentials: ['Download teacher access details', 'تنزيل بيانات دخول المعلمين'],
  credentials_unavailable: [
    'The private handoff file is no longer available.',
    'ملف التسليم الخاص لم يعد متاحًا.',
  ],
  credentials_help: [
    'Confirm your administrator password to download the private teacher handoff. Each teacher must change their temporary password at first sign-in.',
    'أكّد كلمة مرور الأدمن لتنزيل بيانات الدخول الخاصة. يجب على كل معلم تغيير كلمة مروره المؤقتة عند أول دخول.',
  ],
};
