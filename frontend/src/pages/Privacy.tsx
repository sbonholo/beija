import { Link } from 'react-router-dom';

export function Privacy() {
  return (
    <div className="legal-page">
      <Link to="/" className="legal-back">← Voltar</Link>

      <h1>Política de Privacidade</h1>
      <p className="legal-updated">Última atualização: 27 de maio de 2026</p>

      <nav className="legal-toc" aria-label="Sumário">
        <p className="legal-toc-title">Sumário</p>
        <ol>
          <li><a href="#intro">1. Introdução</a></li>
          <li><a href="#dados">2. Dados que coletamos</a></li>
          <li><a href="#finalidades">3. Como usamos seus dados</a></li>
          <li><a href="#base-legal">4. Base legal (LGPD)</a></li>
          <li><a href="#compartilhamento">5. Compartilhamento de dados</a></li>
          <li><a href="#transferencias">6. Transferências internacionais</a></li>
          <li><a href="#retencao">7. Retenção de dados</a></li>
          <li><a href="#direitos">8. Seus direitos</a></li>
          <li><a href="#exercer">9. Como exercer seus direitos</a></li>
          <li><a href="#cookies">10. Cookies e tecnologias similares</a></li>
          <li><a href="#menores">11. Crianças e adolescentes</a></li>
          <li><a href="#seguranca">12. Segurança</a></li>
          <li><a href="#alteracoes">13. Alterações nesta política</a></li>
          <li><a href="#contato">14. Contato e Encarregado de Dados</a></li>
        </ol>
      </nav>

      <section id="intro">
        <h2>1. Introdução</h2>
        <p>
          Esta Política de Privacidade descreve como o <strong>Beija</strong>
          (&ldquo;nós&rdquo;, &ldquo;Beija&rdquo;) coleta, usa, compartilha e protege seus
          dados pessoais quando você utiliza nosso aplicativo de conexões em eventos.
          Tratamos seus dados em conformidade com a <strong>Lei Geral de Proteção de
          Dados (Lei nº 13.709/2018 - LGPD)</strong> e demais legislações aplicáveis.
        </p>
        <p>
          Ao usar o Beija, você concorda com as práticas descritas aqui. Se você
          não concorda, não utilize o aplicativo.
        </p>
      </section>

      <section id="dados">
        <h2>2. Dados que coletamos</h2>

        <h3>2.1. Dados de cadastro</h3>
        <ul>
          <li><strong>Número de telefone</strong> — usado para autenticação via WhatsApp OTP.</li>
          <li><strong>Nome ou apelido</strong> — exibido no seu perfil.</li>
        </ul>

        <h3>2.2. Dados de perfil</h3>
        <ul>
          <li><strong>Foto de perfil</strong> — enviada por você, armazenada no Cloudflare R2.</li>
          <li><strong>Gênero e identidade buscada</strong> — usados para mostrar perfis compatíveis.</li>
          <li><strong>Biografia opcional</strong> — texto livre que você escolhe exibir.</li>
          <li><strong>Data de nascimento (opcional)</strong> — usada para confirmar idade mínima.</li>
        </ul>

        <h3>2.3. Dados de localização</h3>
        <p>
          Quando você faz <em>check-in</em> em um evento, registramos sua localização
          aproximada para encontrar outras pessoas presentes naquele evento. A
          localização é usada apenas no contexto do evento e não é exibida no seu
          perfil público.
        </p>

        <h3>2.4. Dados de uso</h3>
        <ul>
          <li>Eventos em que você fez check-in.</li>
          <li>Reações (beijos, curtidas, fogo) enviadas e recebidas.</li>
          <li>Matches realizados.</li>
          <li>Mensagens trocadas em conversas privadas.</li>
          <li>Bloqueios e denúncias.</li>
        </ul>

        <h3>2.5. Dados técnicos</h3>
        <ul>
          <li>Endereço IP, tipo de dispositivo, sistema operacional e navegador.</li>
          <li>Logs de acesso e identificadores de sessão.</li>
        </ul>
      </section>

      <section id="finalidades">
        <h2>3. Como usamos seus dados</h2>
        <ul>
          <li>Autenticar você via código enviado pelo WhatsApp.</li>
          <li>Exibir seu perfil para outras pessoas no mesmo evento.</li>
          <li>Possibilitar reações, matches e conversas entre usuários.</li>
          <li>Moderar conteúdo, investigar denúncias e prevenir abusos.</li>
          <li>Garantir a segurança da plataforma (rate limiting, detecção de fraude).</li>
          <li>Atender obrigações legais e responder requisições de autoridades.</li>
          <li>Melhorar o serviço com métricas agregadas e anônimas.</li>
        </ul>
      </section>

      <section id="base-legal">
        <h2>4. Base legal (LGPD)</h2>
        <p>O tratamento dos seus dados pessoais é fundamentado nas seguintes hipóteses do art. 7º da LGPD:</p>
        <ul>
          <li><strong>Consentimento</strong> (art. 7º, I) — para envio de fotos, localização e demais dados opcionais de perfil.</li>
          <li><strong>Execução de contrato</strong> (art. 7º, V) — para prestar o serviço de conexões que você solicitou.</li>
          <li><strong>Legítimo interesse</strong> (art. 7º, IX) — para segurança, prevenção de fraude e moderação.</li>
          <li><strong>Cumprimento de obrigação legal</strong> (art. 7º, II) — quando exigido por autoridades competentes.</li>
        </ul>
      </section>

      <section id="compartilhamento">
        <h2>5. Compartilhamento de dados</h2>
        <p>Compartilhamos dados pessoais apenas com os seguintes operadores, estritamente para a finalidade indicada:</p>
        <ul>
          <li><strong>Twilio Inc. (EUA)</strong> — envio do código OTP via WhatsApp. Recebe apenas seu número de telefone e o texto do código.</li>
          <li><strong>Cloudflare, Inc. (EUA)</strong> — armazenamento e distribuição das fotos de perfil via Cloudflare R2.</li>
          <li><strong>Railway Corp. (EUA)</strong> — hospedagem da aplicação e do banco de dados (Postgres/SQLite).</li>
        </ul>
        <p>
          Não vendemos seus dados pessoais. Compartilhamento com autoridades só
          ocorre mediante ordem judicial ou requisição legal válida.
        </p>
      </section>

      <section id="transferencias">
        <h2>6. Transferências internacionais</h2>
        <p>
          Os operadores listados acima processam dados em servidores localizados
          fora do Brasil (principalmente nos Estados Unidos). Essas transferências
          observam as hipóteses do art. 33 da LGPD, incluindo cláusulas contratuais
          padrão e medidas técnicas adequadas de proteção.
        </p>
      </section>

      <section id="retencao">
        <h2>7. Retenção de dados</h2>
        <ul>
          <li><strong>Dados de cadastro e perfil</strong> — mantidos enquanto sua conta estiver ativa.</li>
          <li><strong>Mensagens</strong> — mantidas enquanto o match existir.</li>
          <li><strong>Check-ins</strong> — expiram automaticamente ao final do evento.</li>
          <li><strong>Logs técnicos</strong> — mantidos por até 6 meses para fins de segurança e auditoria.</li>
          <li><strong>Após exclusão da conta</strong> — todos os dados pessoais são removidos em até 30 dias, exceto quando a retenção for exigida por lei.</li>
        </ul>
      </section>

      <section id="direitos">
        <h2>8. Seus direitos</h2>
        <p>De acordo com o art. 18 da LGPD, você tem direito a:</p>
        <ul>
          <li><strong>Acesso</strong> — saber quais dados pessoais tratamos sobre você.</li>
          <li><strong>Retificação</strong> — corrigir dados incompletos, inexatos ou desatualizados.</li>
          <li><strong>Exclusão</strong> — pedir o apagamento dos seus dados (você pode fazer isso direto no app, em Perfil → Apagar perfil).</li>
          <li><strong>Portabilidade</strong> — receber seus dados em formato estruturado.</li>
          <li><strong>Oposição</strong> — opor-se a tratamentos baseados em legítimo interesse.</li>
          <li><strong>Revogação do consentimento</strong> — a qualquer momento.</li>
          <li><strong>Informações sobre compartilhamento</strong> — saber com quem compartilhamos seus dados.</li>
        </ul>
      </section>

      <section id="exercer">
        <h2>9. Como exercer seus direitos</h2>
        <p>
          Para exercer qualquer direito previsto na LGPD, entre em contato com nosso
          Encarregado de Dados pelo e-mail <a href="mailto:info@beija.app">info@beija.app</a>.
          Responderemos em até 15 dias.
        </p>
        <p>
          Para excluir sua conta imediatamente, acesse <strong>Perfil → Apagar perfil</strong>
          no aplicativo.
        </p>
      </section>

      <section id="cookies">
        <h2>10. Cookies e tecnologias similares</h2>
        <p>
          Usamos armazenamento local do navegador (<code>localStorage</code> e
          <code>sessionStorage</code>) para manter você autenticado e guardar
          preferências da sessão. Não usamos cookies de rastreamento publicitário
          nem ferramentas de analytics que identifiquem você individualmente.
        </p>
      </section>

      <section id="menores">
        <h2>11. Crianças e adolescentes</h2>
        <p>
          O Beija é destinado <strong>exclusivamente a pessoas com 18 anos ou mais</strong>.
          Não coletamos intencionalmente dados de menores de 18 anos. Se identificarmos
          uma conta pertencente a menor de idade, ela será excluída imediatamente.
          Se você é responsável legal e suspeita que um menor está usando o app,
          entre em contato pelo e-mail acima.
        </p>
      </section>

      <section id="seguranca">
        <h2>12. Segurança</h2>
        <p>
          Adotamos medidas técnicas e administrativas para proteger seus dados,
          incluindo: criptografia em trânsito (TLS), tokens de autenticação assinados
          (JWT), limites de taxa, validação de uploads, isolamento de credenciais
          de produção e revisões periódicas de segurança.
        </p>
        <p>
          Nenhum sistema é 100% seguro. Em caso de incidente de segurança que possa
          gerar risco relevante aos seus direitos, notificaremos você e a Autoridade
          Nacional de Proteção de Dados (ANPD) conforme exige a LGPD.
        </p>
      </section>

      <section id="alteracoes">
        <h2>13. Alterações nesta política</h2>
        <p>
          Podemos atualizar esta política periodicamente. Quando houver alterações
          relevantes, notificaremos você por meio do aplicativo ou por mensagem.
          A data da última atualização sempre estará indicada no topo desta página.
        </p>
      </section>

      <section id="contato">
        <h2>14. Contato e Encarregado de Dados</h2>
        <p>
          Para dúvidas, solicitações ou reclamações sobre o tratamento dos seus
          dados pessoais, entre em contato com nosso Encarregado pelo e-mail:
        </p>
        <p><a href="mailto:info@beija.app"><strong>info@beija.app</strong></a></p>
        <p>
          Você também pode encaminhar reclamações à <strong>Autoridade Nacional de
          Proteção de Dados (ANPD)</strong> pelo site
          {' '}<a href="https://www.gov.br/anpd" target="_blank" rel="noopener noreferrer">gov.br/anpd</a>.
        </p>
      </section>

      <p className="legal-footer">
        <Link to="/terms">Termos de Uso</Link> · <Link to="/">Voltar para o início</Link>
      </p>
    </div>
  );
}
