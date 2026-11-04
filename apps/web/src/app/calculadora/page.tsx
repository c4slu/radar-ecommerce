import { RiskCalculator } from "./risk-calculator";

export default function CalculadoraPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Calculadora de risco</h1>
        <p className="text-sm text-zinc-500">
          Simule um produto antes de comprar o lote. Nas próximas fases os dados de mercado serão preenchidos
          automaticamente pelos coletores.
        </p>
      </div>
      <RiskCalculator />
    </div>
  );
}
