const { diagnose } = require('../lib/diagnose');

diagnose()
  .then((report) => {
    console.log(`\nDiagnostic Google Trends — mot-clé « ${report.keyword} »\n`);

    const cookies = report.sessionCookies || [];
    console.log(`Cookies de session obtenus : ${cookies.length ? cookies.join(', ') : 'aucun'}`);
    console.log(
      cookies.includes('NID')
        ? '   → session ouverte par Google, bon signe.\n'
        : "   → pas de cookie NID : Google n'a pas ouvert de session, un 429 est attendu.\n"
    );

    for (const step of report.steps) {
      console.log(`── ${step.step}`);
      if (step.networkError) {
        console.log(`   erreur réseau : ${step.networkError}\n`);
        continue;
      }
      if (step.missing) {
        console.log(`   ${step.note}\n`);
        continue;
      }
      console.log(`   statut       : ${step.statusCode}`);
      console.log(`   lecture      : ${step.interpretation}`);
      console.log(`   content-type : ${step.contentType}`);
      if (step.location) console.log(`   redirection  : ${step.location}`);
      console.log(`   taille corps : ${step.bodyLength} caractères`);
      console.log(`   début corps  : ${(step.bodyPreview || '').slice(0, 300)}\n`);
    }

    if (report.availableWidgetIds) {
      console.log(`Widgets disponibles : ${report.availableWidgetIds.join(', ')}\n`);
    }

    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
