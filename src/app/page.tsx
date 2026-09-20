import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Bot, MessageSquare, Shield, Database, ArrowRight, RefreshCw } from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-brand-navy text-brand-ice selection:bg-brand-electric/30 font-inter">
      {/* Navbar */}
      <nav className="fixed top-0 w-full z-50 border-b border-white/5 bg-brand-navy/50 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <Link href="/" className="flex items-center">
            <Image src="/full_logo.png" alt="OMNIX Dental & Health AI" width={160} height={48} className="object-contain" priority />
          </Link>
          <div className="hidden md:flex gap-8 text-sm font-medium text-brand-ice/70">
            <Link href="#features" className="hover:text-brand-glow transition-colors">Features</Link>
            <Link href="#rag" className="hover:text-brand-glow transition-colors">RAG Engine</Link>
            <Link href="#demo" className="hover:text-brand-glow transition-colors">Chat Demo</Link>
          </div>
          <Link href="/login" className="px-5 py-2.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 transition-all font-medium text-sm inline-flex items-center justify-center">
            Login
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 md:pt-48 md:pb-32 overflow-hidden">
        {/* Glow Effects */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-brand-electric/20 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-brand-violet/10 rounded-full blur-[100px] pointer-events-none" />
        
        <div className="max-w-7xl mx-auto px-6 relative z-10 text-center flex flex-col items-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-brand-deep/30 border border-brand-electric/30 text-brand-cyan text-sm font-medium mb-8">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-glow opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-glow"></span>
            </span>
            OMNIX v2.0 is now live
          </div>
          
          <h1 className="font-montserrat text-5xl md:text-7xl font-bold leading-tight mb-6 max-w-4xl">
            Autonomous AI Sales for the <br className="hidden md:block" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-electric via-brand-cyan to-brand-violet">
              Modern Enterprise
            </span>
          </h1>
          
          <p className="text-lg md:text-xl text-brand-ice/60 max-w-2xl mb-12 leading-relaxed">
            Deploy an intelligent WhatsApp agent that qualifies leads, handles objections, and schedules appointments 24/7 with a human-like touch.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4">
            <Link href="/signup" className="group relative px-8 py-4 bg-gradient-to-r from-brand-electric to-brand-violet rounded-full font-semibold text-white overflow-hidden transition-all hover:scale-105 hover:shadow-[0_0_40px_rgba(15,118,236,0.4)] flex items-center justify-center gap-2 cursor-pointer">
              <span className="relative z-10">Start Your Free Trial</span>
              <ArrowRight className="w-4 h-4 relative z-10 group-hover:translate-x-1 transition-transform" />
            </Link>
            <Link href="/demo" className="px-8 py-4 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 transition-all font-semibold flex items-center justify-center cursor-pointer">
              Book a Demo
            </Link>
          </div>
        </div>
      </section>

      {/* Trust Banner */}
      <section className="py-8 border-t border-white/5 bg-brand-deep/5 relative z-20">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <p className="font-montserrat font-medium text-brand-ice/60 tracking-wide text-sm uppercase">
            Engineered exclusively for modern dental clinics and healthcare centers
          </p>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="py-24 relative border-t border-white/5 bg-brand-navy/50">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="font-montserrat text-3xl md:text-5xl font-bold mb-4">Powerful Capabilities</h2>
            <p className="text-brand-ice/60">Built for high-ticket sales and lead conversion.</p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { icon: MessageSquare, title: "WhatsApp Native", desc: "Seamlessly integrates with WhatsApp to engage customers where they already are." },
              { icon: Bot, title: "Objection Handling", desc: "Trained on real sales scripts to gracefully pivot from objections to closed deals." },
              { icon: Shield, title: "Enterprise Grade", desc: "SOC2 compliant architecture ensuring your data and conversations remain secure." },
              { icon: RefreshCw, title: "CRM Sync", desc: "Qualifies leads and seamlessly transitions them into CRM platforms like HubSpot." },
            ].map((feat, i) => (
              <div key={i} className="p-8 rounded-3xl bg-brand-deep/10 border border-brand-electric/20 hover:border-brand-electric/50 transition-all group hover:-translate-y-1">
                <div className="w-12 h-12 rounded-2xl bg-brand-electric/20 flex items-center justify-center mb-6 text-brand-glow group-hover:scale-110 transition-transform">
                  <feat.icon className="w-6 h-6" />
                </div>
                <h3 className="font-montserrat text-xl font-bold mb-3">{feat.title}</h3>
                <p className="text-brand-ice/60 leading-relaxed text-sm">{feat.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* RAG Section */}
      <section id="rag" className="py-24 relative">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center gap-16">
          <div className="flex-1 space-y-8">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-brand-violet/10 border border-brand-violet/30 text-brand-violet text-sm font-medium">
              <Database className="w-4 h-4" /> Vector RAG Engine
            </div>
            <h2 className="font-montserrat text-4xl md:text-5xl font-bold leading-tight">
              Instant Answers from your <span className="text-brand-glow">Knowledge Base</span>
            </h2>
            <p className="text-lg text-brand-ice/60 leading-relaxed">
              Upload your PDFs, price lists, and past successful chats. Our Retrieval-Augmented Generation (RAG) engine instantly injects accurate, verifiable context into every response.
            </p>
            <ul className="space-y-4 text-brand-ice/80">
              {['Auto-syncs with your latest documents', 'Prevents LLM hallucinations', 'Cite sources in real-time'].map((item, i) => (
                <li key={i} className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-brand-cyan/20 flex items-center justify-center text-brand-cyan">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  </div>
                  {item}
                </li>
              ))}
            </ul>
          </div>
          
          <div className="flex-1 w-full relative">
            <div className="absolute inset-0 bg-gradient-to-tr from-brand-electric/20 to-brand-violet/20 rounded-3xl blur-3xl" />
            <div className="relative bg-[#010a22] border border-white/10 rounded-3xl p-6 shadow-2xl">
              <div className="flex items-center gap-3 border-b border-white/5 pb-4 mb-4">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-500/80" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                  <div className="w-3 h-3 rounded-full bg-green-500/80" />
                </div>
                <div className="text-xs text-brand-ice/40 font-mono">vector_store_query.py</div>
              </div>
              <div className="space-y-4 font-mono text-sm">
                <div className="text-brand-ice/40"># Simulating semantic search...</div>
                <div className="text-brand-cyan">await RAG.search(&quot;Dental Implant Pricing 2026&quot;)</div>
                <div className="bg-brand-navy p-4 rounded-xl border border-white/5 text-brand-ice">
                  <span className="text-brand-glow font-bold">Match (98.4%):</span> &quot;Full arch implants start at $12,000 with a lifetime warranty. Dr. Smith handles all cases.&quot;
                </div>
                <div className="text-brand-violet font-semibold animate-pulse">Action: Injecting context to LangGraph...</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Mock Chat UI */}
      <section id="demo" className="py-24 relative bg-brand-navy/50 border-t border-white/5">
         <div className="max-w-4xl mx-auto px-6 text-center">
            <h2 className="font-montserrat text-4xl font-bold mb-12">See it in Action</h2>
            <div className="bg-[#051126] border border-brand-electric/30 rounded-3xl overflow-hidden shadow-[0_0_80px_rgba(15,118,236,0.15)] flex flex-col text-left">
                <div className="bg-brand-navy p-4 border-b border-brand-electric/20 flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-brand-deep/20 flex items-center justify-center overflow-hidden border border-brand-electric/30 shrink-0">
                        <Image src="/small_logo.png" alt="OMNIX AI" width={28} height={28} className="object-contain" />
                    </div>
                    <div>
                        <h3 className="font-bold text-white">OMNIX Agent</h3>
                        <p className="text-xs text-brand-glow">Online</p>
                    </div>
                </div>
                <div className="p-6 space-y-6 flex-1 min-h-[300px]">
                    <div className="flex gap-4">
                        <div className="w-8 h-8 rounded-full bg-brand-electric/20 shrink-0" />
                        <div className="bg-brand-navy border border-white/5 p-4 rounded-2xl rounded-tl-sm text-brand-ice/90 max-w-[80%]">
                            Hi! I&apos;m interested in veneers but I&apos;m worried about the cost.
                        </div>
                    </div>
                    <div className="flex gap-4 flex-row-reverse">
                        <div className="w-8 h-8 rounded-full bg-brand-deep/20 shrink-0 flex items-center justify-center overflow-hidden border border-brand-electric/30">
                            <Image src="/small_logo.png" alt="OMNIX AI" width={20} height={20} className="object-contain" />
                        </div>
                        <div className="bg-brand-deep/20 border border-brand-electric/30 p-4 rounded-2xl rounded-tr-sm text-brand-ice max-w-[80%]">
                            Hello! I completely understand that cost is a big factor. Our veneers start at $800 per tooth, and we offer 0% financing for 12 months. <br/><br/>Many of our patients find the monthly plan makes it very manageable! Would you like me to check our schedule for a free consultation?
                        </div>
                    </div>
                </div>
            </div>
         </div>
      </section>
      
      {/* Footer */}
      <footer className="border-t border-white/5 py-12">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-6">
            <p className="text-brand-ice/40 text-sm">© 2026 OMNIX AI. All rights reserved.</p>
            <div className="flex gap-6 text-sm text-brand-ice/40">
                <Link href="/privacy" className="hover:text-brand-glow transition-colors">Privacy Policy</Link>
                <Link href="/terms" className="hover:text-brand-glow transition-colors">Terms of Service</Link>
                <Link href="/contact" className="hover:text-brand-glow transition-colors">Contact Us</Link>
            </div>
        </div>
      </footer>
    </div>
  );
}
