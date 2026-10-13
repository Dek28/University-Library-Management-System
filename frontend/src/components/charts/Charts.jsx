import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { EmptyState } from '../ui/DataTable';
import { BarChart3 } from 'lucide-react';
import { useThemeStore } from '../../store/theme';

/**
 * Chart palette.
 *
 * Recharts writes colours into SVG presentation attributes, which do not
 * resolve CSS custom properties, so the palette cannot ride on the theme
 * variables the rest of the app uses. It is selected per mode instead.
 *
 * Both columns are validated sets, not one palette lightened: each was checked
 * against its own surface for the lightness band, a chroma floor, adjacent-pair
 * separation under protanopia/deuteranopia/tritanopia, the normal-vision floor
 * and contrast. Slot 1 is the application's own brand blue; the remaining hues
 * are ordered so that neighbouring series stay distinguishable.
 *
 * Assign slots in order. Never cycle past the end of the list: a ninth series
 * belongs in "Other", or the chart belongs as small multiples.
 */
const SERIES_LIGHT = ['#255ae8', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];
const SERIES_DARK = ['#4d86f7', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'];

/** Kept as a named export: callers use it to colour their own legends. */
export const SERIES_COLORS = SERIES_LIGHT;

const readVar = (name, fallback) => {
  if (typeof window === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value ? `rgb(${value})` : fallback;
};

/**
 * Chart chrome, resolved from the active theme.
 *
 * Grid and axes are deliberately recessive: they orient the eye and then get
 * out of the way of the data.
 */
function useChartTheme() {
  const mode = useThemeStore((state) => state.resolved);
  const dark = mode === 'dark';

  const muted = readVar('--n-500', dark ? '#9aa3b2' : '#687183');
  const grid = readVar('--n-200', dark ? '#2d333f' : '#e1e4ec');

  return {
    mode,
    series: dark ? SERIES_DARK : SERIES_LIGHT,
    axis: { fontSize: 11, fill: muted },
    grid,
    cursor: readVar('--n-100', dark ? '#212630' : '#edeff4'),
    legend: { fontSize: 12, paddingTop: 10, color: muted },
    tooltip: {
      contentStyle: {
        borderRadius: 12,
        border: `1px solid ${readVar('--line', dark ? '#2c333f' : '#e2e5ed')}`,
        background: readVar('--panel', dark ? '#151920' : '#ffffff'),
        boxShadow: dark
          ? '0 12px 32px -8px rgba(0,0,0,0.6)'
          : '0 12px 32px -8px rgba(15,23,42,0.18)',
        fontSize: 12,
        padding: '8px 11px',
      },
      itemStyle: { color: readVar('--n-700', dark ? '#ccd4de' : '#383f4d'), padding: '1px 0' },
      labelStyle: {
        fontWeight: 600,
        color: readVar('--n-900', dark ? '#f3f5f9' : '#141921'),
        marginBottom: 3,
      },
    },
  };
}

function NoData({ label = 'No data for this period' }) {
  return <EmptyState icon={BarChart3} title={label} className="py-10" />;
}

/** Issued vs returned over time. */
export function CirculationLineChart({ data = [], height = 260 }) {
  const t = useChartTheme();
  if (!data.length) return <NoData />;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={t.grid} vertical={false} />
        <XAxis dataKey="label" tick={t.axis} tickLine={false} axisLine={{ stroke: t.grid }} />
        <YAxis tick={t.axis} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip {...t.tooltip} />
        {/* Two series, so identity is never carried by colour alone. */}
        <Legend wrapperStyle={t.legend} iconType="circle" iconSize={8} />
        <Line
          type="monotone" dataKey="issued" name="Borrowed"
          stroke={t.series[0]} strokeWidth={2}
          dot={{ r: 0 }} activeDot={{ r: 5, strokeWidth: 2, stroke: readVar('--panel', '#fff') }}
        />
        <Line
          type="monotone" dataKey="returned" name="Returned"
          stroke={t.series[1]} strokeWidth={2}
          dot={{ r: 0 }} activeDot={{ r: 5, strokeWidth: 2, stroke: readVar('--panel', '#fff') }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

/**
 * Donut used for category and status breakdowns.
 *
 * The legend sits below the ring rather than beside it: these cards are often
 * a third of the row, and a side legend leaves the donut too small to read.
 */
export function CategoryDonut({ data = [], nameKey = 'name', valueKey = 'count', height = 260 }) {
  const t = useChartTheme();
  if (!data.length) return <NoData />;

  const total = data.reduce((sum, entry) => sum + Number(entry[valueKey] || 0), 0);

  // Radii are absolute rather than percentages. A percentage is resolved
  // against whatever the container measures on first paint, which on a cold
  // load can be close to zero and leaves the ring collapsed to a sliver.
  const legendSpace = 44;
  const centreY = Math.max(60, (height - legendSpace) / 2);
  const outer = Math.max(40, Math.min(centreY, (height - legendSpace) / 2) - 6);
  const inner = Math.round(outer * 0.62);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
        <Pie
          data={data}
          dataKey={valueKey}
          nameKey={nameKey}
          cx="50%"
          cy={centreY}
          innerRadius={inner}
          outerRadius={outer}
          paddingAngle={2}
          // A surface-coloured gap keeps adjacent arcs from bleeding together.
          stroke={readVar('--panel', '#ffffff')}
          strokeWidth={2}
          isAnimationActive={false}
        >
          {data.map((entry, index) => (
            <Cell key={entry[nameKey] || index} fill={t.series[index % t.series.length]} />
          ))}
        </Pie>
        <Tooltip
          {...t.tooltip}
          formatter={(value, name) => [`${value} (${total ? Math.round((value / total) * 100) : 0}%)`, name]}
        />
        <Legend
          layout="horizontal"
          align="center"
          verticalAlign="bottom"
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: 11.5, lineHeight: '18px', paddingTop: 4, color: t.axis.fill }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

/** Grouped bars, used for daily circulation on the reports screen. */
export function DailyBarChart({ data = [], bars = [{ key: 'count', name: 'Count' }], xKey = 'date', height = 280 }) {
  const t = useChartTheme();
  if (!data.length) return <NoData />;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 12, left: -18, bottom: 0 }} barGap={2}>
        <CartesianGrid strokeDasharray="3 3" stroke={t.grid} vertical={false} />
        <XAxis dataKey={xKey} tick={t.axis} tickLine={false} axisLine={{ stroke: t.grid }} interval="preserveStartEnd" />
        <YAxis tick={t.axis} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip {...t.tooltip} cursor={{ fill: t.cursor }} />
        {bars.length > 1 && <Legend wrapperStyle={t.legend} iconType="circle" iconSize={8} />}
        {bars.map((bar, index) => (
          <Bar
            key={bar.key}
            dataKey={bar.key}
            name={bar.name}
            fill={t.series[index % t.series.length]}
            // Rounded at the data end only; the baseline end stays square so
            // the bar still reads as anchored to zero.
            radius={[4, 4, 0, 0]}
            maxBarSize={34}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Horizontal ranking bars for departments, categories and spaces. */
export function RankingBarChart({ data = [], nameKey = 'name', valueKey = 'count', height = 280 }) {
  const t = useChartTheme();
  if (!data.length) return <NoData />;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={t.grid} horizontal={false} />
        <XAxis type="number" tick={t.axis} tickLine={false} axisLine={false} allowDecimals={false} />
        <YAxis type="category" dataKey={nameKey} tick={t.axis} tickLine={false} axisLine={false} width={130} />
        <Tooltip {...t.tooltip} cursor={{ fill: t.cursor }} />
        <Bar dataKey={valueKey} fill={t.series[0]} radius={[0, 4, 4, 0]} maxBarSize={20} />
      </BarChart>
    </ResponsiveContainer>
  );
}
