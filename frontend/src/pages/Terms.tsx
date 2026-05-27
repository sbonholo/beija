import { Link } from 'react-router-dom';

export function Terms() {
  return (
    <div className="legal-page">
      <Link to="/" className="legal-back">← Voltar</Link>

      <h1>Termos de Uso</h1>
      <p className="legal-updated">Última atualização: 27 de maio de 2026</p>

      <nav className="legal-toc" aria-label="Sumário">
        <p className="legal-toc-title">Sumário</p>
        <ol>
          <li><a href="#aceitacao">1. Aceitação dos termos</a></li>
          <li><a href="#elegibilidade">2. Elegibilidade (18+)</a></li>
          <li><a href="#conta">3. Sua conta</a></li>
          <li><a href="#conduta">4. Conduta do usuário</a></li>
          <li><a href="#conteudo">5. Seu conteúdo</a></li>
          <li><a href="#moderacao">6. Tolerância zero e moderação</a></li>
          <li><a href="#bloqueio">7. Bloqueio e denúncia</a></li>
          <li><a href="#suspensao">8. Suspensão e encerramento</a></li>
          <li><a href="#pi">9. Propriedade intelectual</a></li>
          <li><a href="#garantias">10. Isenção de garantias</a></li>
          <li><a href="#responsabilidade">11. Limitação de responsabilidade</a></li>
          <li><a href="#indenizacao">12. Indenização</a></li>
          <li><a href="#lei">13. Lei aplicável e foro</a></li>
          <li><a href="#disputas">14. Resolução de disputas</a></li>
          <li><a href="#gerais">15. Disposições gerais</a></li>
          <li><a href="#contato">16. Contato</a></li>
        </ol>
      </nav>

      <section id="aceitacao">
        <h2>1. Aceitação dos termos</h2>
        <p>
          Bem-vindo(a) ao <strong>Beija</strong>. Estes Termos de Uso (&ldquo;Termos&rdquo;)
          regulam o acesso e uso do aplicativo Beija, oferecido para pessoas
          interessadas em conhecer outras pessoas em eventos. Ao criar uma conta,
          fazer login ou usar o aplicativo de qualquer forma, você concorda
          integralmente com estes Termos e com a nossa
          {' '}<Link to="/privacidade">Política de Privacidade</Link>.
        </p>
      </section>

      <section id="elegibilidade">
        <h2>2. Elegibilidade (18+)</h2>
        <p>
          O Beija é destinado <strong>exclusivamente a pessoas com 18 anos ou mais</strong>.
          Ao usar o aplicativo, você declara e garante que possui idade igual ou
          superior a 18 anos. Contas pertencentes a menores de idade serão
          excluídas imediatamente sem aviso prévio.
        </p>
      </section>

      <section id="conta">
        <h2>3. Sua conta</h2>
        <ul>
          <li>Você se cadastra usando seu número de telefone, autenticado via código enviado pelo WhatsApp.</li>
          <li>Você é responsável por manter o sigilo dos códigos recebidos e por todas as atividades realizadas na sua conta.</li>
          <li>Você deve fornecer informações verdadeiras, precisas e atuais. Perfis falsos, fraudulentos ou que se passam por outra pessoa são proibidos.</li>
          <li>Cada pessoa pode manter apenas uma conta ativa.</li>
        </ul>
      </section>

      <section id="conduta">
        <h2>4. Conduta do usuário</h2>
        <p>Ao usar o Beija, você concorda em <strong>não</strong>:</p>
        <ul>
          <li>Assediar, intimidar, ameaçar ou perseguir outros usuários (incluindo discurso de ódio, racismo, LGBTfobia, misoginia, xenofobia, capacitismo ou qualquer forma de discriminação).</li>
          <li>Criar perfis falsos, usar fotos de terceiros sem autorização ou se passar por outra pessoa.</li>
          <li>Publicar, enviar ou solicitar conteúdo sexualmente explícito, nudez, pornografia ou material obsceno.</li>
          <li>Publicar conteúdo violento, gore ou que glorifique violência.</li>
          <li>Solicitar ou oferecer serviços sexuais comerciais, escort ou similar.</li>
          <li>Solicitar dinheiro, transferências, presentes ou favores financeiros (golpes românticos).</li>
          <li>Divulgar publicidade não solicitada, esquemas em pirâmide, links de afiliados ou spam.</li>
          <li>Coletar dados de outros usuários (scraping, raspagem, automação).</li>
          <li>Tentar burlar limites de uso, mecanismos de segurança ou medidas de moderação.</li>
          <li>Usar o app para fins ilícitos ou em violação de qualquer lei aplicável.</li>
        </ul>
      </section>

      <section id="conteudo">
        <h2>5. Seu conteúdo</h2>

        <h3>5.1. Propriedade</h3>
        <p>
          Você mantém todos os direitos sobre o conteúdo que publica (fotos,
          biografia, mensagens). O Beija não reivindica propriedade sobre o
          seu conteúdo.
        </p>

        <h3>5.2. Licença concedida ao Beija</h3>
        <p>
          Ao publicar conteúdo no Beija, você concede ao Beija uma licença
          não-exclusiva, mundial, gratuita e revogável para hospedar, armazenar,
          processar, exibir e distribuir esse conteúdo exclusivamente para
          operação do serviço. Esta licença termina quando você exclui o conteúdo
          ou sua conta.
        </p>

        <h3>5.3. Responsabilidade</h3>
        <p>
          Você é o único responsável pelo conteúdo que publica. Garante que detém
          os direitos necessários e que o conteúdo não viola direitos de terceiros,
          leis aplicáveis ou estes Termos.
        </p>
      </section>

      <section id="moderacao">
        <h2>6. Tolerância zero e moderação</h2>
        <p>
          O Beija possui <strong>tolerância zero a conteúdo questionável e
          comportamento abusivo</strong>. Reservamo-nos o direito de remover qualquer
          conteúdo e suspender qualquer conta que viole estes Termos, a nosso
          exclusivo critério.
        </p>
        <ul>
          <li>Denúncias enviadas pelos usuários são revisadas em até <strong>24 horas</strong>.</li>
          <li>Conteúdo flagrantemente ilegal ou abusivo é removido imediatamente.</li>
          <li>Usuários que violem estes Termos podem ter contas suspensas ou permanentemente banidas.</li>
          <li>Reincidências resultam em banimento definitivo do dispositivo e do número de telefone.</li>
        </ul>
      </section>

      <section id="bloqueio">
        <h2>7. Bloqueio e denúncia</h2>
        <p>
          Todo usuário pode, a qualquer momento e diretamente pelo aplicativo:
        </p>
        <ul>
          <li><strong>Bloquear</strong> outro usuário — após bloquear, vocês deixam de aparecer um para o outro, conversas existentes são encerradas e novas interações ficam impedidas.</li>
          <li><strong>Denunciar</strong> outro usuário ou conteúdo — denúncias são revisadas pela equipe de moderação em até 24 horas.</li>
        </ul>
        <p>
          Em casos de risco iminente (ameaça à vida ou integridade física), procure
          também as autoridades policiais.
        </p>
      </section>

      <section id="suspensao">
        <h2>8. Suspensão e encerramento</h2>
        <p>
          Podemos suspender ou encerrar sua conta, a qualquer momento e sem aviso
          prévio, se identificarmos violação destes Termos, suspeita de fraude,
          comportamento abusivo, ou por exigência legal.
        </p>
        <p>
          Você pode encerrar sua conta a qualquer momento em
          <strong> Perfil → Apagar perfil</strong>. Após o encerramento, seus dados
          serão removidos conforme nossa
          {' '}<Link to="/privacidade">Política de Privacidade</Link>.
        </p>
      </section>

      <section id="pi">
        <h2>9. Propriedade intelectual</h2>
        <p>
          Todo o código-fonte, design, marcas, logotipos, textos e demais elementos
          do aplicativo Beija são de propriedade exclusiva do Beija ou de seus
          licenciantes, protegidos por leis de propriedade intelectual. É proibido
          copiar, modificar, distribuir ou criar obras derivadas sem autorização
          expressa por escrito.
        </p>
      </section>

      <section id="garantias">
        <h2>10. Isenção de garantias</h2>
        <p>
          O Beija é fornecido <strong>&ldquo;no estado em que se encontra&rdquo;</strong>
          (<em>as is</em>) e <strong>&ldquo;conforme disponível&rdquo;</strong>
          (<em>as available</em>), sem garantias de qualquer natureza, expressas ou
          implícitas. Não garantimos que o serviço será ininterrupto, livre de erros,
          seguro contra qualquer ataque, ou que produzirá qualquer resultado específico
          (incluindo, sem limitação, formação de relacionamentos).
        </p>
      </section>

      <section id="responsabilidade">
        <h2>11. Limitação de responsabilidade</h2>
        <p>
          Na máxima extensão permitida pela lei aplicável, o Beija e seus
          administradores, colaboradores e parceiros não serão responsáveis por
          quaisquer danos indiretos, incidentais, especiais, consequenciais ou
          punitivos, incluindo perda de dados, lucros cessantes ou danos morais,
          decorrentes do uso ou da impossibilidade de uso do serviço.
        </p>
        <p>
          O Beija <strong>não é responsável pela conduta de outros usuários</strong>
          dentro ou fora do aplicativo. Encontros marcados pelo aplicativo ocorrem
          por sua conta e risco — tome precauções razoáveis ao encontrar pessoas
          conhecidas online.
        </p>
      </section>

      <section id="indenizacao">
        <h2>12. Indenização</h2>
        <p>
          Você concorda em indenizar, defender e isentar o Beija, seus
          administradores, colaboradores e parceiros de qualquer reclamação,
          processo, dano, perda ou despesa (incluindo honorários advocatícios
          razoáveis) decorrentes de: (i) seu uso do serviço; (ii) sua violação
          destes Termos; (iii) sua violação de direitos de terceiros; ou
          (iv) o conteúdo que você publica.
        </p>
      </section>

      <section id="lei">
        <h2>13. Lei aplicável e foro</h2>
        <p>
          Estes Termos são regidos pelas leis da República Federativa do Brasil.
          Fica eleito o foro da Comarca da Capital do Estado de São Paulo (SP)
          para dirimir quaisquer controvérsias decorrentes destes Termos, com
          renúncia expressa a qualquer outro, por mais privilegiado que seja.
        </p>
      </section>

      <section id="disputas">
        <h2>14. Resolução de disputas</h2>
        <p>
          Antes de iniciar qualquer procedimento judicial, as partes se
          comprometem a tentar resolver eventuais conflitos amigavelmente,
          mediante contato pelo e-mail <a href="mailto:info@beija.app">info@beija.app</a>
          {' '}por um período mínimo de 30 dias.
        </p>
        <p>
          Conforme o Código de Defesa do Consumidor (Lei nº 8.078/90), nada nestes
          Termos restringe direitos garantidos a consumidores residentes no Brasil.
        </p>
      </section>

      <section id="gerais">
        <h2>15. Disposições gerais</h2>
        <ul>
          <li><strong>Alterações</strong> — Podemos atualizar estes Termos periodicamente. Continuar a usar o app após alterações constitui aceitação dos novos Termos.</li>
          <li><strong>Acordo integral</strong> — Estes Termos, junto com a Política de Privacidade, constituem o acordo integral entre você e o Beija.</li>
          <li><strong>Divisibilidade</strong> — Se qualquer cláusula for considerada inválida, as demais permanecem em pleno vigor.</li>
          <li><strong>Não-renúncia</strong> — A falta de exercício de qualquer direito previsto nestes Termos não constitui renúncia a esse direito.</li>
          <li><strong>Cessão</strong> — Você não pode ceder seus direitos sob estes Termos sem nossa autorização prévia por escrito.</li>
        </ul>
      </section>

      <section id="contato">
        <h2>16. Contato</h2>
        <p>
          Dúvidas sobre estes Termos? Entre em contato:
          {' '}<a href="mailto:info@beija.app"><strong>info@beija.app</strong></a>
        </p>
      </section>

      <p className="legal-footer">
        <Link to="/privacidade">Política de Privacidade</Link> · <Link to="/">Voltar para o início</Link>
      </p>
    </div>
  );
}
