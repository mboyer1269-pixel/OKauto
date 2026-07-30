import Link from 'next/link';
import { Car, Zap, BarChart3, Shield, ArrowRight } from 'lucide-react';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white">
      <header className="border-b">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <span className="text-2xl font-bold text-brand-700">OKauto</span>
          <div className="flex gap-3">
            <Link href="/login" className="btn-secondary">Sign In</Link>
            <Link href="/register" className="btn-primary">Get Started</Link>
          </div>
        </div>
      </header>

      <section className="max-w-6xl mx-auto px-4 py-20 text-center">
        <h1 className="text-5xl font-bold text-slate-900 mb-6">
          List More Inventory<br />
          <span className="text-brand-600">in Less Time</span>
        </h1>
        <p className="text-xl text-slate-600 mb-8 max-w-2xl mx-auto">
          OKauto helps dealerships post, manage, and track Facebook Marketplace listings
          with AI-assisted descriptions, team analytics, and sold-vehicle alerts.
        </p>
        <div className="flex gap-4 justify-center">
          <Link href="/register" className="btn-primary text-lg px-8 py-3">
            Start Free Trial <ArrowRight className="ml-2" size={20} />
          </Link>
          <Link href="/login" className="btn-secondary text-lg px-8 py-3">Sign In</Link>
        </div>
      </section>

      <section className="bg-slate-50 py-20">
        <div className="max-w-6xl mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-12">Everything Your Dealership Needs</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { icon: Car, title: 'Inventory Management', desc: 'Import CSV, decode VINs, manage photos and pricing from one dashboard.' },
              { icon: Zap, title: '60-Second Listings', desc: 'Chrome extension pre-fills Marketplace forms. You review and publish.' },
              { icon: BarChart3, title: 'Team Analytics', desc: 'Track listings per salesperson. Monitor activity and performance.' },
              { icon: Shield, title: 'Sold Alerts', desc: 'Instant notifications when vehicles sell so stale listings come down fast.' },
            ].map((f) => (
              <div key={f.title} className="card text-center">
                <f.icon className="mx-auto mb-4 text-brand-600" size={32} />
                <h3 className="font-semibold mb-2">{f.title}</h3>
                <p className="text-sm text-slate-600">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 text-center">
        <h2 className="text-3xl font-bold mb-4">Ready to streamline your listings?</h2>
        <p className="text-slate-600 mb-8">Join dealerships using OKauto to reach more buyers on Facebook Marketplace.</p>
        <Link href="/register" className="btn-primary text-lg px-8 py-3">Get Started Free</Link>
      </section>

      <footer className="border-t py-8 text-center text-sm text-slate-500">
        <p>&copy; {new Date().getFullYear()} OKauto. All rights reserved.</p>
        <p className="mt-2">Human-in-the-loop listing assist. We respect platform policies.</p>
      </footer>
    </div>
  );
}
