const MalagaSupabase = (() => {
  let client = null;
  let configState = { loaded: false, ready: false, error: null };
  let profileCache = null;

  function basePath() {
    let path = window.location.pathname;
    if (path.endsWith('/index.html')) path = path.slice(0, -10) + '/';
    else if (!path.endsWith('/')) {
      const slash = path.lastIndexOf('/');
      path = slash >= 0 ? path.slice(0, slash + 1) : '/';
    }
    return path;
  }

  async function init() {
    if (configState.loaded) return configState;
    configState.loaded = true;

    try {
      const res = await fetch(`${basePath()}data/supabase-config.json`, { cache: 'no-store' });
      if (!res.ok) throw new Error('Configurazione Supabase non trovata');
      const cfg = await res.json();
      if (!cfg.projectUrl || !cfg.anonKey || cfg.anonKey.includes('YOUR')) {
        throw new Error('Inserisci la anon key in data/supabase-config.json');
      }
      if (!window.supabase?.createClient) throw new Error('Libreria Supabase non caricata');
      client = window.supabase.createClient(cfg.projectUrl, cfg.anonKey);
      configState.ready = true;
    } catch (error) {
      configState.error = error.message || 'Supabase non configurato';
    }

    return configState;
  }

  function db() {
    if (!client) throw new Error('Supabase non pronto');
    return client;
  }

  async function session() {
    await init();
    if (!client) return null;
    const { data } = await client.auth.getSession();
    return data.session || null;
  }

  async function signInWithPassword(email, password) {
    await init();
    const { error } = await db().auth.signInWithPassword({ email, password });
    if (error) throw error;
  }

  async function signOut() {
    const { error } = await db().auth.signOut();
    if (error) throw error;
    profileCache = null;
  }

  function onAuthChange(callback) {
    if (!client) return () => {};
    const { data } = client.auth.onAuthStateChange(() => {
      profileCache = null;
      callback();
    });
    return () => data.subscription.unsubscribe();
  }

  async function profile() {
    await init();
    const s = await session();
    if (!s) return null;
    if (profileCache) return profileCache;
    const { data, error } = await db()
      .from('profiles')
      .select('id,email,display_name,role,status')
      .eq('id', s.user.id)
      .maybeSingle();
    if (error) throw error;
    profileCache = data || {
      id: s.user.id,
      email: s.user.email,
      display_name: s.user.email,
      role: 'user',
      status: 'disabled'
    };
    return profileCache;
  }

  async function updateProfile(patch) {
    const p = await profile();
    const { error } = await db()
      .from('profiles')
      .update(patch)
      .eq('id', p.id);
    if (error) throw error;
    profileCache = null;
  }

  async function listProposals() {
    const { data, error } = await db().rpc('list_planning_proposals');
    if (error) throw error;
    return data || [];
  }

  async function listApprovedProgram() {
    await init();
    if (!client) return [];
    const { data, error } = await db().rpc('list_approved_program');
    if (error) throw error;
    return data || [];
  }

  async function saveProposal(input) {
    const row = {
      title: input.title,
      description: input.description || '',
      day_date: input.day_date,
      location: input.location || '',
      place_id: input.place_id || null,
      status: input.status || 'open'
    };

    if (input.id) {
      const { error } = await db()
        .from('planning_proposals')
        .update(row)
        .eq('id', input.id);
      if (error) throw error;
      return;
    }

    const { error } = await db().from('planning_proposals').insert(row);
    if (error) throw error;
  }

  async function vote(proposal) {
    const { error } = await db().from('votes').upsert({
      proposal_id: proposal.proposal_id,
      proposal_version: proposal.current_version,
      vote: proposal.vote
    }, {
      onConflict: 'proposal_id,proposal_version,user_id'
    });
    if (error) throw error;
  }

  async function approveProposal(proposalId) {
    const { error } = await db().rpc('approve_planning', { proposal_id_input: proposalId });
    if (error) throw error;
  }

  async function deleteProposal(proposalId) {
    const { error: approvedError } = await db()
      .from('approved_plannings')
      .delete()
      .eq('proposal_id', proposalId);
    if (approvedError) throw approvedError;

    const { error } = await db()
      .from('planning_proposals')
      .update({ status: 'archived' })
      .eq('id', proposalId);
    if (error) throw error;
  }

  async function invite(email, role) {
    const { error } = await db().from('invites').insert({ email, role });
    if (error) throw error;
  }

  return {
    init,
    session,
    signInWithPassword,
    signOut,
    onAuthChange,
    profile,
    updateProfile,
    listApprovedProgram,
    listProposals,
    saveProposal,
    vote,
    approveProposal,
    deleteProposal,
    invite,
    get state() { return configState; }
  };
})();

window.MalagaSupabase = MalagaSupabase;
